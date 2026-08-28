import { Module } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CardsController, AdminCardsController } from './cards.controller';
import { SimulatedCardAdapter } from './providers/card-provider.interface';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [CardsService, SimulatedCardAdapter],
  controllers: [CardsController, AdminCardsController],
  exports: [CardsService],
})
export class CardsModule {}
