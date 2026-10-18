import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../common/types/auth-user';
import { InventoryRepository } from '../inventory/inventory.repository';
import { PAYMENT_PROVIDER, PaymentOutcome, PaymentProvider } from '../payments/payment-provider.interface';
import { ProductsRepository } from '../products/products.repository';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SaleWithDetails, SalesRepository } from './sales.repository';

const CURRENCY = 'INR';
const MAX_TOTAL_CENTS = 2_000_000_000;

interface OrderItem {
  productId: string;
  quantity: number;
}

interface SaleContext {
  user: AuthUser;
  storeId: string;
  idempotencyKey: string;
  requestHash: string;
  items: OrderItem[];
  paymentOutcome?: PaymentOutcome;
}

export interface SaleResult {
  sale: SaleWithDetails;
  replayed: boolean;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly sales: SalesRepository,
    private readonly products: ProductsRepository,
    private readonly inventory: InventoryRepository,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  async create(user: AuthUser, storeId: string, idempotencyKey: string, dto: CreateSaleDto): Promise<SaleResult> {
    const items = this.mergeItems(dto);
    const requestHash = this.hashRequest(items, dto.paymentOutcome);

    const existing = await this.sales.findByIdempotencyKey(storeId, idempotencyKey);
    if (existing) return this.replay(existing, requestHash);

    const context: SaleContext = {
      user,
      storeId,
      idempotencyKey,
      requestHash,
      items,
      paymentOutcome: dto.paymentOutcome,
    };

    try {
      const sale = await this.sales.transaction((db) => this.processSale(db, context));
      return { sale, replayed: false };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const winner = await this.sales.findByIdempotencyKey(storeId, idempotencyKey);
        if (winner) return this.replay(winner, requestHash);
      }
      throw error;
    }
  }

  async list(storeId: string, query: ListSalesQueryDto) {
    const { data, total } = await this.sales.findPage(storeId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      status: query.status,
    });
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async get(storeId: string, id: string) {
    const sale = await this.sales.findInStore(storeId, id);
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  private async processSale(db: Prisma.TransactionClient, context: SaleContext): Promise<SaleWithDetails> {
    const { user, storeId, items } = context;

    const sale = await this.sales.createPending(db, {
      merchantId: user.merchantId,
      storeId,
      userId: user.id,
      idempotencyKey: context.idempotencyKey,
      requestHash: context.requestHash,
    });

    const productIds = items.map((item) => item.productId);
    const products = await this.products.findActiveByIds(user.merchantId, productIds, db);
    if (products.length !== productIds.length) {
      const found = new Set(products.map((product) => product.id));
      throw new NotFoundException({
        message: 'Some products were not found or are inactive',
        productIds: productIds.filter((id) => !found.has(id)),
      });
    }

    const stock = await this.inventory.lockForSale(db, storeId, productIds);
    const shortages = items
      .filter((item) => (stock.get(item.productId) ?? 0) < item.quantity)
      .map((item) => ({
        productId: item.productId,
        requested: item.quantity,
        available: stock.get(item.productId) ?? 0,
      }));
    if (shortages.length > 0) {
      throw new ConflictException({ message: 'Insufficient inventory', shortages });
    }

    const priceById = new Map<string, number>(
      products.map((product): [string, number] => [product.id, product.priceCents]),
    );
    const lines = items.map((item) => {
      const unitPriceCents = priceById.get(item.productId) as number;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents,
        lineTotalCents: unitPriceCents * item.quantity,
      };
    });
    const totalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    if (totalCents > MAX_TOTAL_CENTS) {
      throw new BadRequestException('Sale total exceeds the allowed maximum');
    }

    const charge = await this.payments.charge({
      reference: sale.id,
      amountCents: totalCents,
      currency: CURRENCY,
      simulate: context.paymentOutcome,
    });

    const paid = charge.status === 'SUCCESS';
    if (paid) {
      for (const line of lines) {
        await this.inventory.decrement(db, storeId, line.productId, line.quantity);
      }
    }

    return this.sales.finalize(db, sale.id, {
      status: paid ? SaleStatus.COMPLETED : SaleStatus.FAILED,
      totalCents,
      items: lines,
      payment: {
        provider: this.payments.name,
        status: charge.status,
        amountCents: totalCents,
        providerReference: charge.providerReference,
        failureReason: charge.failureReason,
      },
    });
  }

  private replay(sale: SaleWithDetails, requestHash: string): SaleResult {
    if (sale.requestHash !== requestHash) {
      throw new UnprocessableEntityException('Idempotency-Key was already used with a different request');
    }
    return { sale, replayed: true };
  }

  private mergeItems(dto: CreateSaleDto): OrderItem[] {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    return [...quantities.entries()]
      .map(([productId, quantity]) => ({ productId, quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId));
  }

  private hashRequest(items: OrderItem[], outcome?: PaymentOutcome) {
    return createHash('sha256')
      .update(JSON.stringify({ items, outcome: outcome ?? 'SUCCESS' }))
      .digest('hex');
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
