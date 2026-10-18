import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  findInMerchant(id: string, merchantId: string) {
    return this.prisma.store.findFirst({ where: { id, merchantId } });
  }

  findManyForUser(merchantId: string, storeId: string | null) {
    return this.prisma.store.findMany({
      where: { merchantId, ...(storeId ? { id: storeId } : {}) },
      orderBy: { name: 'asc' },
    });
  }
}
