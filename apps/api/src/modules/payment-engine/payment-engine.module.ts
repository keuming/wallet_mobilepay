import { Module } from '@nestjs/common';
import { PaymentEngineService } from './payment-engine.service';
import { PaymentEngineController, AirtimeController, GiftCardsController } from './payment-engine.controller';
import { Hub2Adapter } from './providers/hub2.adapter';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { ReloadlyGiftCardsAdapter } from './providers/reloadly-giftcards.adapter';
import { LedgerModule } from '../ledger/ledger.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [LedgerModule, SmsModule],
  providers: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter, ReloadlyGiftCardsAdapter],
  controllers: [PaymentEngineController, AirtimeController, GiftCardsController],
  exports: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter, ReloadlyGiftCardsAdapter],
})
export class PaymentEngineModule {}
