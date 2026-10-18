import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StoreAccessGuard } from '../common/guards/store-access.guard';
import { AuthUser } from '../common/types/auth-user';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetStockDto } from './dto/set-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('stores/:storeId/inventory')
@UseGuards(StoreAccessGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.inventory.list(storeId);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Put(':productId')
  setQuantity(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetStockDto,
  ) {
    return this.inventory.setQuantity(user.merchantId, storeId, productId, dto.quantity);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Patch(':productId/adjust')
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventory.adjust(user.merchantId, storeId, productId, dto.delta);
  }
}
