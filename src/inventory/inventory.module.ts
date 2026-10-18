import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ProductsModule, StoresModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryRepository],
})
export class InventoryModule {}
