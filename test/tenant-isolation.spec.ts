import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { Fixtures, login, resetDatabase, seedFixtures, stockOf } from './helpers/fixtures';

describe('Tenant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let cashierA1: string;
  let ownerA: string;
  let ownerB: string;

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
    cashierA1 = await login(app, 'cashier.a1@test.dev');
    ownerA = await login(app, 'owner.a@test.dev');
    ownerB = await login(app, 'owner.b@test.dev');
  });

  const http = () => request(app.getHttpServer());

  it('rejects requests without a token', async () => {
    const response = await http().get('/products');
    expect(response.status).toBe(401);
  });

  it("blocks a user from another merchant's store", async () => {
    const inventory = await http()
      .get(`/stores/${fixtures.storeB1}/inventory`)
      .set('Authorization', `Bearer ${cashierA1}`);
    const sales = await http()
      .get(`/stores/${fixtures.storeB1}/sales`)
      .set('Authorization', `Bearer ${cashierA1}`);
    const ownerSales = await http()
      .get(`/stores/${fixtures.storeB1}/sales`)
      .set('Authorization', `Bearer ${ownerA}`);

    expect(inventory.status).toBe(403);
    expect(sales.status).toBe(403);
    expect(ownerSales.status).toBe(403);
  });

  it('blocks a store user from a sibling store of the same merchant', async () => {
    const response = await http()
      .get(`/stores/${fixtures.storeA2}/inventory`)
      .set('Authorization', `Bearer ${cashierA1}`);

    expect(response.status).toBe(403);
  });

  it('does not let a sale be created in another merchant\'s store', async () => {
    const response = await http()
      .post(`/stores/${fixtures.storeB1}/sales`)
      .set('Authorization', `Bearer ${cashierA1}`)
      .set('Idempotency-Key', 'cross-tenant-0001')
      .send({ items: [{ productId: fixtures.pens.id, quantity: 1 }] });

    expect(response.status).toBe(403);
    expect(await prisma.sale.count()).toBe(0);
    expect(await stockOf(prisma, fixtures.storeB1, fixtures.pens.id)).toBe(8);
  });

  it("does not let a sale include another merchant's product", async () => {
    const response = await http()
      .post(`/stores/${fixtures.storeA1}/sales`)
      .set('Authorization', `Bearer ${cashierA1}`)
      .set('Idempotency-Key', 'cross-tenant-0002')
      .send({ items: [{ productId: fixtures.pens.id, quantity: 1 }] });

    expect(response.status).toBe(404);
    expect(await prisma.sale.count()).toBe(0);
  });

  it("hides another merchant's products", async () => {
    const byId = await http().get(`/products/${fixtures.beans.id}`).set('Authorization', `Bearer ${ownerB}`);
    const list = await http().get('/products').set('Authorization', `Bearer ${ownerB}`);

    expect(byId.status).toBe(404);
    expect(list.status).toBe(200);
    expect(list.body.map((product: { id: string }) => product.id)).toEqual([fixtures.pens.id]);
  });

  it("does not let an owner edit another merchant's product", async () => {
    const response = await http()
      .patch(`/products/${fixtures.beans.id}`)
      .set('Authorization', `Bearer ${ownerB}`)
      .send({ priceCents: 1 });

    expect(response.status).toBe(404);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: fixtures.beans.id } });
    expect(product.priceCents).toBe(fixtures.beans.priceCents);
  });

  it("does not let inventory be set for another merchant's product", async () => {
    const response = await http()
      .put(`/stores/${fixtures.storeA1}/inventory/${fixtures.pens.id}`)
      .set('Authorization', `Bearer ${ownerA}`)
      .send({ quantity: 50 });

    expect(response.status).toBe(404);
  });

  it('restricts product management to owners', async () => {
    const response = await http()
      .post('/products')
      .set('Authorization', `Bearer ${cashierA1}`)
      .send({ sku: 'NEW-1', name: 'New product', priceCents: 1000 });

    expect(response.status).toBe(403);
  });
});
