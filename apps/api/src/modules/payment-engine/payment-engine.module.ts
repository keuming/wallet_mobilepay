import { Module } from '@nestjs/common';
import { PaymentEngineService } from './payment-engine.service';
import { PaymentEngineController, AirtimeController } from './payment-engine.controller';
import { Hub2Adapter } from './providers/hub2.adapter';
import { ReloadlyAdapter } from './providers/reloadly.adapter';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter],
  controllers: [PaymentEngineController, AirtimeController],
  exports: [PaymentEngineService, Hub2Adapter, ReloadlyAdapter],
})
export class PaymentEngineModule {}
