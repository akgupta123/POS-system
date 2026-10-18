import { Module } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';

@Module({
  controllers: [StoresController],
  providers: [StoresRepository],
  exports: [StoresRepository],
})
export class StoresModule {}
