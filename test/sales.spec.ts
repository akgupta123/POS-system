import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { Fixtures, login, resetDatabase, seedFixtures, stockOf } from './helpers/fixtures';

describe('Sales', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let cashierToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
    cashierToken = await login(app, 'cashier.a1@test.dev');
  });

  const createSale = (key: string, body: object, token = cashierToken, storeId = fixtures.storeA1) =>
    request(app.getHttpServer())
      .post(`/stores/${storeId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);

  it('completes a sale, prices it on the server and reduces stock', async () => {
    const response = await createSale('sale-key-0001', {
      items: [
        { productId: fixtures.beans.id, quantity: 2 },
        { productId: fixtures.filters.id, quantity: 1 },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.totalCents).toBe(2 * fixtures.beans.priceCents + fixtures.filters.priceCents);
    expect(response.body.payment.status).toBe('SUCCESS');
    expect(response.body.items).toHaveLength(2);

    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(8);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.filters.id)).toBe(4);
  });

  it('rejects client supplied prices', async () => {
    const response = await createSale('sale-key-0002', {
      items: [{ productId: fixtures.beans.id, quantity: 1, priceCents: 1 }],
    });

    expect(response.status).toBe(400);
    expect(await prisma.sale.count()).toBe(0);
  });

  it('records a failed sale and leaves stock untouched when payment fails', async () => {
    const response = await createSale('sale-key-0003', {
      items: [{ productId: fixtures.beans.id, quantity: 3 }],
      paymentOutcome: 'FAILED',
    });

    expect(response.status).toBe(402);
    expect(response.body.status).toBe('FAILED');
    expect(response.body.payment.status).toBe('FAILED');
    expect(response.body.payment.failureReason).toBeTruthy();

    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(10);
    expect(await prisma.sale.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('refuses a sale that exceeds available inventory', async () => {
    const response = await createSale('sale-key-0004', {
      items: [
        { productId: fixtures.beans.id, quantity: 2 },
        { productId: fixtures.filters.id, quantity: 6 },
      ],
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Insufficient inventory');
    expect(response.body.shortages).toEqual([
      { productId: fixtures.filters.id, requested: 6, available: 5 },
    ]);

    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(10);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.filters.id)).toBe(5);
    expect(await prisma.sale.count()).toBe(0);
  });

  it('does not create a second sale when the same request is retried', async () => {
    const body = { items: [{ productId: fixtures.beans.id, quantity: 3 }] };

    const first = await createSale('sale-key-0005', body);
    const second = await createSale('sale-key-0005', body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);

    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(7);
  });

  it('rejects an idempotency key that is reused with a different payload', async () => {
    await createSale('sale-key-0006', { items: [{ productId: fixtures.beans.id, quantity: 1 }] });
    const response = await createSale('sale-key-0006', { items: [{ productId: fixtures.beans.id, quantity: 2 }] });

    expect(response.status).toBe(422);
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(9);
  });

  it('requires an idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post(`/stores/${fixtures.storeA1}/sales`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ items: [{ productId: fixtures.beans.id, quantity: 1 }] });

    expect(response.status).toBe(400);
  });

  it('never oversells when two terminals sell the same stock at once', async () => {
    await prisma.inventory.update({
      where: { storeId_productId: { storeId: fixtures.storeA1, productId: fixtures.beans.id } },
      data: { quantity: 5 },
    });
    const body = { items: [{ productId: fixtures.beans.id, quantity: 3 }] };

    const [a, b] = await Promise.all([createSale('terminal-a-0001', body), createSale('terminal-b-0001', body)]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(2);
    expect(await prisma.sale.count({ where: { status: 'COMPLETED' } })).toBe(1);
  });

  it('creates a single sale when the same request arrives twice concurrently', async () => {
    const body = { items: [{ productId: fixtures.beans.id, quantity: 4 }] };

    const [a, b] = await Promise.all([createSale('retry-storm-0001', body), createSale('retry-storm-0001', body)]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf(prisma, fixtures.storeA1, fixtures.beans.id)).toBe(6);
  });

  it('lists and fetches sales for the store', async () => {
    const created = await createSale('sale-key-0007', { items: [{ productId: fixtures.beans.id, quantity: 1 }] });

    const list = await request(app.getHttpServer())
      .get(`/stores/${fixtures.storeA1}/sales`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(created.body.id);

    const single = await request(app.getHttpServer())
      .get(`/stores/${fixtures.storeA1}/sales/${created.body.id}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(single.status).toBe(200);
    expect(single.body.id).toBe(created.body.id);
  });
});
