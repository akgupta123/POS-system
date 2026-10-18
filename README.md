# POS API

Multi-tenant point-of-sale backend built with NestJS, TypeScript, Prisma and PostgreSQL. Merchants own stores, stores own their inventory, and store users ring up sales against that inventory.

## Setup

Requirements: Node 20+, PostgreSQL 14+, Redis (optional).

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

Environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing |
| `REDIS_URL` | Catalog cache. Leave empty to run without Redis |
| `CATALOG_CACHE_TTL_SECONDS` | TTL for the cached product list |
| `PAYMENT_PROVIDER` | Only `mock` is implemented |

The seed creates two merchants (three stores) with the password `Password@123` for every user:

| User | Role | Scope |
| --- | --- | --- |
| owner.a@acme.test | OWNER | Merchant A, all stores |
| manager.a1@acme.test | MANAGER | Merchant A, store A1 |
| cashier.a1@acme.test | CASHIER | Merchant A, store A1 |
| cashier.a2@acme.test | CASHIER | Merchant A, store A2 |
| owner.b@globex.test | OWNER | Merchant B |
| cashier.b1@globex.test | CASHIER | Merchant B, store B1 |

Import `postman/pos-api.postman_collection.json` into Postman. The login request stores the token, and the seeded store and product ids are set as collection variables.

## Tests

```bash
createdb pos_test
npm test
```

Tests run against a real PostgreSQL database because the interesting behaviour (row locks, unique constraints) can't be mocked meaningfully. They use `TEST_DATABASE_URL`, defaulting to `postgresql://pos:pos@localhost:5432/pos_test`, apply migrations in a global setup and truncate all tables between tests, so never point that variable at a database you care about. Redis is picked up from `TEST_REDIS_URL` (default `redis://localhost:6379`) and the suite passes without it.

Covered scenarios: successful sale, failed payment, insufficient inventory, cross-tenant rejection, duplicate request, plus concurrent sales of the same stock and concurrent duplicate requests.

## API overview

| Method | Path | Roles |
| --- | --- | --- |
| POST | `/auth/login` | public |
| GET | `/stores` | any |
| GET | `/products`, `/products/:id` | any |
| POST, PATCH | `/products`, `/products/:id` | OWNER |
| GET | `/stores/:storeId/inventory` | any |
| PUT | `/stores/:storeId/inventory/:productId` | OWNER, MANAGER |
| PATCH | `/stores/:storeId/inventory/:productId/adjust` | OWNER, MANAGER |
| POST | `/stores/:storeId/sales` | any, requires `Idempotency-Key` header |
| GET | `/stores/:storeId/sales`, `/stores/:storeId/sales/:id` | any |

A sale request looks like:

```json
{
  "items": [{ "productId": "…", "quantity": 2 }],
  "paymentOutcome": "SUCCESS"
}
```

`paymentOutcome` (`SUCCESS` or `FAILED`) only steers the mock provider. Prices are never accepted from the client. Responses: `201` created, `200` replay of an earlier request, `402` payment failed (the failed sale is returned), `409` insufficient inventory, `422` idempotency key reused with a different body.

## Database and schema decisions

- Products belong to a merchant (one catalog and one price per merchant); inventory is a row per store and product, unique on `(storeId, productId)`.
- Money is stored as integer cents.
- `CHECK` constraints back the application rules: stock can never go negative, prices and totals are non-negative, sale item quantities are positive.
- Indexes cover the tenant filters (`merchantId`, `storeId`), the sales listing (`storeId, createdAt`), and the idempotency lookup (unique `storeId, idempotencyKey`).
- Products are soft-disabled with `isActive` so old sales keep their references.
- The initial migration is plain SQL in `prisma/migrations`, including the check constraints Prisma can't express in the schema file.

## Tenant isolation

- The JWT carries `merchantId`, `storeId` (null for owners) and `role`. IDs from the request are never trusted on their own.
- Product and sale lookups always include the caller's `merchantId` in the query, so another merchant's ids come back as 404.
- Routes under `/stores/:storeId` go through `StoreAccessGuard`: store-bound users must match the store id, and the store must belong to the caller's merchant, otherwise 403.
- Inventory writes and sales verify that the product belongs to the caller's merchant, so a store can't be fed another tenant's catalog.
- Roles are enforced by a global `RolesGuard` with `@Roles()` on the handlers.

## Transactions and concurrency

A sale runs inside one database transaction:

1. Insert the sale as `PENDING` (this claims the idempotency key).
2. Load the active products for the caller's merchant and take prices from them.
3. `SELECT … FOR UPDATE` the inventory rows for the products in the sale, ordered by product id.
4. Check quantities against the locked rows.
5. Charge the payment provider.
6. On success decrement stock and mark the sale `COMPLETED`; on a declined payment mark it `FAILED` without touching stock.

With stock at 5 and two terminals selling 3, the second transaction blocks on the row lock until the first commits, then sees 2 available and gets a 409. Locking in a consistent order prevents deadlocks between sales with overlapping products, and the `CHECK (quantity >= 0)` constraint is a last line of defence if code ever bypasses the lock.

Trade-off: the payment call happens while row locks are held. That is fine for a fast provider and keeps stock and payment consistent without a compensation flow, but a slow real gateway would call for reserving stock first and confirming asynchronously.

## Idempotency

Clients send an `Idempotency-Key` header on `POST /stores/:storeId/sales`. Keys are scoped to a store through a unique index on `(storeId, idempotencyKey)`.

- A repeat of a finished request returns the stored sale with `200` and an `Idempotent-Replayed: true` header.
- Two identical requests racing each other both try to insert the same key; the loser waits on the unique index, hits the violation after the winner commits, and returns the winner's sale instead of failing.
- Because the key is claimed before inventory is checked, a retry never turns into a spurious "insufficient inventory" error.
- A SHA-256 of the normalised items and payment outcome is stored with the sale; reusing a key with a different payload returns `422`.
- Requests that roll back (insufficient stock, validation, provider errors) don't keep the key, so the client can retry them.

## Redis

The product list (`GET /products`) is the read-heavy endpoint, so it is cached per merchant under `catalog:<merchantId>` with a short TTL and invalidated on product create and update. Inventory and sales are never cached because they must reflect the latest committed state. If Redis is down or not configured, the cache layer logs a warning and requests go straight to PostgreSQL.

## Assumptions

- A single currency (INR) and a mock payment provider.
- One user belongs to one merchant, and to at most one store.
- Stock changes from sales are the only automatic movements; manual changes go through the inventory endpoints.
- Tokens are stateless, so a role or store change takes effect after the token expires.
