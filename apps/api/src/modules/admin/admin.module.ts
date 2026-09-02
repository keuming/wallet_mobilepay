import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PaymentEngineModule, LedgerModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
