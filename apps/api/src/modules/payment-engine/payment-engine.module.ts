import { Module } from '@nestjs/common';
import { PaymentEngineService } from './payment-engine.service';
import { PaymentEngineController } from './payment-engine.controller';
import { Hub2Adapter } from './providers/hub2.adapter';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [PaymentEngineService, Hub2Adapter],
  controllers: [PaymentEngineController],
  exports: [PaymentEngineService, Hub2Adapter],
})
export class PaymentEngineModule {}
