import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [PaymentEngineModule, LedgerModule, SmsModule],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
