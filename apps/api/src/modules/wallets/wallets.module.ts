import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController, TransfersController } from './wallets.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [LedgerModule, PricingModule],
  providers: [WalletsService],
  controllers: [WalletsController, TransfersController],
  exports: [WalletsService],
})
export class WalletsModule {}
