import { Module } from '@nestjs/common';
import { CollecteService } from './collecte.service';
import { CollecteController } from './collecte.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [LedgerModule, SecurityModule],
  providers: [CollecteService],
  controllers: [CollecteController],
  exports: [CollecteService],
})
export class CollecteModule {}
