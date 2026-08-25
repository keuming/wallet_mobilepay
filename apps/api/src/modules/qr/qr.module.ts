import { Module } from '@nestjs/common';
import { QrService } from './qr.service';
import { QrController } from './qr.controller';
import { PaymentEngineModule } from '../payment-engine/payment-engine.module';

@Module({
  imports: [PaymentEngineModule],
  providers: [QrService],
  controllers: [QrController],
  exports: [QrService],
})
export class QrModule {}
