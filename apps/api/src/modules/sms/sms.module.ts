import { Module } from '@nestjs/common';
import { SmsAdapter } from './sms.adapter';
import { SmsController } from './sms.controller';

@Module({
  controllers: [SmsController],
  providers: [SmsAdapter],
  exports: [SmsAdapter],
})
export class SmsModule {}
