import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { SalesController } from './sales.controller';
import { SalesRepository } from './sales.repository';
import { SalesService } from './sales.service';

@Module({
  imports: [ProductsModule, InventoryModule, PaymentsModule, StoresModule],
  controllers: [SalesController],
  providers: [SalesService, SalesRepository],
})
export class SalesModule {}
