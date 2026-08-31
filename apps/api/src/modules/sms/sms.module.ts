import { Module } from '@nestjs/common';
import { SmsAdapter } from './sms.adapter';

@Module({
  providers: [SmsAdapter],
  exports: [SmsAdapter],
})
export class SmsModule {}
