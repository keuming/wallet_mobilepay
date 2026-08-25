import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';

@Module({
  imports: [PaymentEngineModule],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
