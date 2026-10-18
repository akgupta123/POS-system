import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByMerchant(merchantId: string) {
    return this.prisma.product.findMany({ where: { merchantId }, orderBy: { name: 'asc' } });
  }

  findByIdInMerchant(id: string, merchantId: string) {
    return this.prisma.product.findFirst({ where: { id, merchantId } });
  }

  findActiveByIds(merchantId: string, ids: string[], db: Prisma.TransactionClient = this.prisma) {
    return db.product.findMany({ where: { merchantId, isActive: true, id: { in: ids } } });
  }

  create(merchantId: string, data: { sku: string; name: string; priceCents: number; isActive?: boolean }) {
    return this.prisma.product.create({ data: { ...data, merchantId } });
  }

  update(id: string, data: { name?: string; priceCents?: number; isActive?: boolean }) {
    return this.prisma.product.update({ where: { id }, data });
  }
}
