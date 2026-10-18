import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const saleInclude = {
  items: { include: { product: { select: { sku: true, name: true } } } },
  payment: true,
} satisfies Prisma.SaleInclude;

export type SaleWithDetails = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

interface NewSale {
  merchantId: string;
  storeId: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}

interface SaleOutcome {
  status: SaleStatus;
  totalCents: number;
  items: { productId: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  payment: {
    provider: string;
    status: PaymentStatus;
    amountCents: number;
    providerReference: string | null;
    failureReason: string | null;
  };
}

@Injectable()
export class SalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { maxWait: 5000, timeout: 15000 });
  }

  findByIdempotencyKey(storeId: string, idempotencyKey: string) {
    return this.prisma.sale.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
      include: saleInclude,
    });
  }

  createPending(db: Prisma.TransactionClient, data: NewSale) {
    return db.sale.create({ data });
  }

  finalize(db: Prisma.TransactionClient, saleId: string, outcome: SaleOutcome) {
    return db.sale.update({
      where: { id: saleId },
      data: {
        status: outcome.status,
        totalCents: outcome.totalCents,
        items: { create: outcome.items },
        payment: { create: outcome.payment },
      },
      include: saleInclude,
    });
  }

  async findPage(storeId: string, params: { skip: number; take: number; status?: SaleStatus }) {
    const where: Prisma.SaleWhereInput = {
      storeId,
      status: params.status ?? { not: SaleStatus.PENDING },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { data, total };
  }

  findInStore(storeId: string, id: string) {
    return this.prisma.sale.findFirst({ where: { id, storeId }, include: saleInclude });
  }
}
