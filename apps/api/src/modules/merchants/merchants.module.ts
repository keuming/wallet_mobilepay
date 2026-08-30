import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PaymentEngineModule, LedgerModule],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
