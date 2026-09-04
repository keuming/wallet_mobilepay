import { Module } from '@nestjs/common';
import { PaymentEngineService } from './payment-engine.service';
import { PaymentEngineController, AirtimeController, GiftCardsController, UtilityPaymentsController } from './payment-engine.controller';
import { Hub2Adapter } from './providers/hub2.adapter';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { ReloadlyGiftCardsAdapter } from './providers/reloadly-giftcards.adapter';
import { ReloadlyUtilitiesAdapter } from './providers/reloadly-utilities.adapter';
import { LedgerModule } from '../ledger/ledger.module';
import { SmsModule } from '../sms/sms.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [LedgerModule, SmsModule, PricingModule],
  providers: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter, ReloadlyGiftCardsAdapter, ReloadlyUtilitiesAdapter],
  controllers: [PaymentEngineController, AirtimeController, GiftCardsController, UtilityPaymentsController],
  exports: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter, ReloadlyGiftCardsAdapter, ReloadlyUtilitiesAdapter],
})
export class PaymentEngineModule {}
