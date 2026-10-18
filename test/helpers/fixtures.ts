import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'Password@123';

export interface Fixtures {
  merchantA: string;
  merchantB: string;
  storeA1: string;
  storeA2: string;
  storeB1: string;
  beans: { id: string; priceCents: number };
  filters: { id: string; priceCents: number };
  pens: { id: string; priceCents: number };
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Payment", "SaleItem", "Sale", "Inventory", "Product", "User", "Store", "Merchant" CASCADE',
  );
}

export async function seedFixtures(prisma: PrismaService): Promise<Fixtures> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const merchantA = randomUUID();
  const merchantB = randomUUID();
  const storeA1 = randomUUID();
  const storeA2 = randomUUID();
  const storeB1 = randomUUID();
  const beans = { id: randomUUID(), priceCents: 25000 };
  const filters = { id: randomUUID(), priceCents: 10000 };
  const pens = { id: randomUUID(), priceCents: 5000 };

  await prisma.merchant.createMany({
    data: [
      { id: merchantA, name: 'Merchant A' },
      { id: merchantB, name: 'Merchant B' },
    ],
  });
  await prisma.store.createMany({
    data: [
      { id: storeA1, merchantId: merchantA, name: 'A1' },
      { id: storeA2, merchantId: merchantA, name: 'A2' },
      { id: storeB1, merchantId: merchantB, name: 'B1' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { email: 'owner.a@test.dev', name: 'Owner A', role: Role.OWNER, merchantId: merchantA, storeId: null, passwordHash },
      { email: 'cashier.a1@test.dev', name: 'Cashier A1', role: Role.CASHIER, merchantId: merchantA, storeId: storeA1, passwordHash },
      { email: 'cashier.a2@test.dev', name: 'Cashier A2', role: Role.CASHIER, merchantId: merchantA, storeId: storeA2, passwordHash },
      { email: 'owner.b@test.dev', name: 'Owner B', role: Role.OWNER, merchantId: merchantB, storeId: null, passwordHash },
      { email: 'cashier.b1@test.dev', name: 'Cashier B1', role: Role.CASHIER, merchantId: merchantB, storeId: storeB1, passwordHash },
    ],
  });
  await prisma.product.createMany({
    data: [
      { id: beans.id, merchantId: merchantA, sku: 'BEANS', name: 'Beans', priceCents: beans.priceCents },
      { id: filters.id, merchantId: merchantA, sku: 'FILTERS', name: 'Filters', priceCents: filters.priceCents },
      { id: pens.id, merchantId: merchantB, sku: 'PENS', name: 'Pens', priceCents: pens.priceCents },
    ],
  });
  await prisma.inventory.createMany({
    data: [
      { storeId: storeA1, productId: beans.id, quantity: 10 },
      { storeId: storeA1, productId: filters.id, quantity: 5 },
      { storeId: storeA2, productId: beans.id, quantity: 4 },
      { storeId: storeB1, productId: pens.id, quantity: 8 },
    ],
  });

  return { merchantA, merchantB, storeA1, storeA2, storeB1, beans, filters, pens };
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
  return response.body.accessToken as string;
}

export async function stockOf(prisma: PrismaService, storeId: string, productId: string): Promise<number> {
  const row = await prisma.inventory.findUniqueOrThrow({
    where: { storeId_productId: { storeId, productId } },
  });
  return row.quantity;
}
