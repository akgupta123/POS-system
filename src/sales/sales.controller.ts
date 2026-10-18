import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StoreAccessGuard } from '../common/guards/store-access.guard';
import { AuthUser } from '../common/types/auth-user';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SalesService } from './sales.service';

@Controller('stores/:storeId/sales')
@UseGuards(StoreAccessGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() dto: CreateSaleDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const idempotencyKey = rawKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException('Idempotency-Key header is required and must be at most 128 characters');
    }

    const { sale, replayed } = await this.sales.create(user, storeId, idempotencyKey, dto);

    if (sale.status === SaleStatus.FAILED) {
      response.status(HttpStatus.PAYMENT_REQUIRED);
    } else {
      response.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    }
    if (replayed) {
      response.setHeader('Idempotent-Replayed', 'true');
    }
    return sale;
  }

  @Get()
  list(@Param('storeId', ParseUUIDPipe) storeId: string, @Query() query: ListSalesQueryDto) {
    return this.sales.list(storeId, query);
  }

  @Get(':id')
  get(@Param('storeId', ParseUUIDPipe) storeId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(storeId, id);
  }
}
