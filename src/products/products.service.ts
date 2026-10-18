import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Product } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  private readonly catalogTtl: number;

  constructor(
    private readonly products: ProductsRepository,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.catalogTtl = config.get<number>('redis.catalogTtlSeconds') ?? 60;
  }

  async list(merchantId: string): Promise<Product[]> {
    const key = this.catalogKey(merchantId);
    const cached = await this.redis.getJson<Product[]>(key);
    if (cached) return cached;

    const products = await this.products.findManyByMerchant(merchantId);
    await this.redis.setJson(key, products, this.catalogTtl);
    return products;
  }

  async get(merchantId: string, id: string) {
    const product = await this.products.findByIdInMerchant(id, merchantId);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(merchantId: string, dto: CreateProductDto) {
    try {
      const product = await this.products.create(merchantId, dto);
      await this.redis.del(this.catalogKey(merchantId));
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A product with SKU ${dto.sku} already exists`);
      }
      throw error;
    }
  }

  async update(merchantId: string, id: string, dto: UpdateProductDto) {
    await this.get(merchantId, id);
    const product = await this.products.update(id, dto);
    await this.redis.del(this.catalogKey(merchantId));
    return product;
  }

  private catalogKey(merchantId: string) {
    return `catalog:${merchantId}`;
  }
}
