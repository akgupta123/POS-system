import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ids = {
  merchantA: '10000000-0000-4000-8000-000000000001',
  merchantB: '10000000-0000-4000-8000-000000000002',
  storeA1: '20000000-0000-4000-8000-000000000001',
  storeA2: '20000000-0000-4000-8000-000000000002',
  storeB1: '20000000-0000-4000-8000-000000000003',
  beans: '30000000-0000-4000-8000-000000000001',
  filters: '30000000-0000-4000-8000-000000000002',
  grinder: '30000000-0000-4000-8000-000000000003',
  mugs: '30000000-0000-4000-8000-000000000004',
  notebook: '30000000-0000-4000-8000-000000000005',
  pens: '30000000-0000-4000-8000-000000000006',
};

const PASSWORD = 'Password@123';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await prisma.merchant.upsert({
    where: { id: ids.merchantA },
    update: {},
    create: { id: ids.merchantA, name: 'Acme Coffee Roasters' },
  });
  await prisma.merchant.upsert({
    where: { id: ids.merchantB },
    update: {},
    create: { id: ids.merchantB, name: 'Globex Stationery' },
  });

  const stores = [
    { id: ids.storeA1, merchantId: ids.merchantA, name: 'Connaught Place' },
    { id: ids.storeA2, merchantId: ids.merchantA, name: 'Saket' },
    { id: ids.storeB1, merchantId: ids.merchantB, name: 'Lajpat Nagar' },
  ];
  for (const store of stores) {
    await prisma.store.upsert({ where: { id: store.id }, update: {}, create: store });
  }

  const users = [
    { email: 'owner.a@acme.test', name: 'Aarav Owner', role: Role.OWNER, merchantId: ids.merchantA, storeId: null },
    { email: 'manager.a1@acme.test', name: 'Meera Manager', role: Role.MANAGER, merchantId: ids.merchantA, storeId: ids.storeA1 },
    { email: 'cashier.a1@acme.test', name: 'Kabir Cashier', role: Role.CASHIER, merchantId: ids.merchantA, storeId: ids.storeA1 },
    { email: 'cashier.a2@acme.test', name: 'Isha Cashier', role: Role.CASHIER, merchantId: ids.merchantA, storeId: ids.storeA2 },
    { email: 'owner.b@globex.test', name: 'Rohan Owner', role: Role.OWNER, merchantId: ids.merchantB, storeId: null },
    { email: 'cashier.b1@globex.test', name: 'Neha Cashier', role: Role.CASHIER, merchantId: ids.merchantB, storeId: ids.storeB1 },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash },
      create: { ...user, passwordHash },
    });
  }

  const products = [
    { id: ids.beans, merchantId: ids.merchantA, sku: 'BEAN-1KG', name: 'House Blend Beans 1kg', priceCents: 129900 },
    { id: ids.filters, merchantId: ids.merchantA, sku: 'FLT-100', name: 'Paper Filters (100)', priceCents: 24900 },
    { id: ids.grinder, merchantId: ids.merchantA, sku: 'GRD-HAND', name: 'Hand Grinder', priceCents: 349900 },
    { id: ids.mugs, merchantId: ids.merchantA, sku: 'MUG-CER', name: 'Ceramic Mug', priceCents: 39900 },
    { id: ids.notebook, merchantId: ids.merchantB, sku: 'NB-A5', name: 'A5 Notebook', priceCents: 15900 },
    { id: ids.pens, merchantId: ids.merchantB, sku: 'PEN-GEL10', name: 'Gel Pens (10)', priceCents: 12900 },
  ];
  for (const product of products) {
    await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
  }

  const stock = [
    { storeId: ids.storeA1, productId: ids.beans, quantity: 40 },
    { storeId: ids.storeA1, productId: ids.filters, quantity: 100 },
    { storeId: ids.storeA1, productId: ids.grinder, quantity: 5 },
    { storeId: ids.storeA1, productId: ids.mugs, quantity: 25 },
    { storeId: ids.storeA2, productId: ids.beans, quantity: 20 },
    { storeId: ids.storeA2, productId: ids.filters, quantity: 60 },
    { storeId: ids.storeB1, productId: ids.notebook, quantity: 80 },
    { storeId: ids.storeB1, productId: ids.pens, quantity: 150 },
  ];
  for (const row of stock) {
    await prisma.inventory.upsert({
      where: { storeId_productId: { storeId: row.storeId, productId: row.productId } },
      update: {},
      create: row,
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
