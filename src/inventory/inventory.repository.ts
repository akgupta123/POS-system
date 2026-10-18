import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const productSummary = { select: { id: true, sku: true, name: true, priceCents: true, isActive: true } };

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByStore(storeId: string) {
    return this.prisma.inventory.findMany({
      where: { storeId },
      include: { product: productSummary },
      orderBy: { product: { name: 'asc' } },
    });
  }

  findOne(storeId: string, productId: string) {
    return this.prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
      include: { product: productSummary },
    });
  }

  setQuantity(storeId: string, productId: string, quantity: number) {
    return this.prisma.inventory.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: { storeId, productId, quantity },
      update: { quantity },
      include: { product: productSummary },
    });
  }

  increase(storeId: string, productId: string, amount: number) {
    return this.prisma.inventory.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: { storeId, productId, quantity: amount },
      update: { quantity: { increment: amount } },
      include: { product: productSummary },
    });
  }

  async decreaseIfAvailable(storeId: string, productId: string, amount: number) {
    const result = await this.prisma.inventory.updateMany({
      where: { storeId, productId, quantity: { gte: amount } },
      data: { quantity: { decrement: amount } },
    });
    return result.count === 1;
  }

  async lockForSale(db: Prisma.TransactionClient, storeId: string, productIds: string[]) {
    const ids = Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await db.$queryRaw<{ productId: string; quantity: number }[]>`
      SELECT "productId", "quantity"
      FROM "Inventory"
      WHERE "storeId" = ${storeId}::uuid AND "productId" IN (${ids})
      ORDER BY "productId"
      FOR UPDATE
    `;
    return new Map<string, number>(rows.map((row): [string, number] => [row.productId, row.quantity]));
  }

  decrement(db: Prisma.TransactionClient, storeId: string, productId: string, amount: number) {
    return db.inventory.update({
      where: { storeId_productId: { storeId, productId } },
      data: { quantity: { decrement: amount } },
    });
  }
}
