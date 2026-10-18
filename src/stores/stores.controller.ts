import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { StoresRepository } from './stores.repository';

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresRepository) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.stores.findManyForUser(user.merchantId, user.storeId);
  }
}
