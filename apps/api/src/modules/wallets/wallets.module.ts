import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController, TransfersController } from './wallets.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [WalletsService],
  controllers: [WalletsController, TransfersController],
  exports: [WalletsService],
})
export class WalletsModule {}
