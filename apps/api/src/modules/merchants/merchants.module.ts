import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SmsModule } from '../sms/sms.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PaymentEngineModule, LedgerModule, SmsModule, PricingModule],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
