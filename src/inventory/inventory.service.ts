import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductsRepository } from '../products/products.repository';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly products: ProductsRepository,
  ) {}

  list(storeId: string) {
    return this.inventory.findByStore(storeId);
  }

  async setQuantity(merchantId: string, storeId: string, productId: string, quantity: number) {
    await this.assertProductInMerchant(merchantId, productId);
    return this.inventory.setQuantity(storeId, productId, quantity);
  }

  async adjust(merchantId: string, storeId: string, productId: string, delta: number) {
    await this.assertProductInMerchant(merchantId, productId);

    if (delta >= 0) {
      return this.inventory.increase(storeId, productId, delta);
    }

    const applied = await this.inventory.decreaseIfAvailable(storeId, productId, -delta);
    if (!applied) {
      throw new ConflictException('Adjustment would bring stock below zero');
    }
    return this.inventory.findOne(storeId, productId);
  }

  private async assertProductInMerchant(merchantId: string, productId: string) {
    const product = await this.products.findByIdInMerchant(productId, merchantId);
    if (!product) throw new NotFoundException('Product not found');
  }
}
