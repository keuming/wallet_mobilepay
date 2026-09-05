import { Module } from '@nestjs/common';
import { LockoutService } from './lockout.service';
import { KycLimitsService } from './kyc-limits.service';

@Module({
  providers: [LockoutService, KycLimitsService],
  exports: [LockoutService, KycLimitsService],
})
export class SecurityModule {}
