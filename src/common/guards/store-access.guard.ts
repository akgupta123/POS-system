import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { StoresRepository } from '../../stores/stores.repository';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(private readonly stores: StoresRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    const storeId: string = request.params.storeId;

    if (!isUUID(storeId)) {
      throw new BadRequestException('storeId must be a UUID');
    }
    if (user.storeId && user.storeId !== storeId) {
      throw new ForbiddenException('You do not have access to this store');
    }

    const store = await this.stores.findInMerchant(storeId, user.merchantId);
    if (!store) {
      throw new ForbiddenException('You do not have access to this store');
    }
    return true;
  }
}
