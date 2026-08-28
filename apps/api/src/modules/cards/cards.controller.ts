import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { CardIssuer } from '@prisma/client';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class IssueCardDto {
  @IsString()
  holderName: string;

  @IsOptional()
  @IsString()
  merchantId?: string; // absent = carte personnelle du particulier connecté

  @IsOptional()
  @IsEnum(CardIssuer)
  issuer?: CardIssuer;
}

export class LoadCardDto {
  @IsInt()
  @IsPositive()
  amount: number;
}

@ApiTags('cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private cardsService: CardsService) {}

  @Post()
  issue(@CurrentUser() user: AuthenticatedUser, @Body() dto: IssueCardDto) {
    return this.cardsService.issueCard({
      ownerUserId: dto.merchantId ? undefined : user.userId,
      ownerMerchantId: dto.merchantId,
      holderName: dto.holderName,
      issuer: dto.issuer ?? 'OTHER',
    });
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.cardsService.listMine(user.userId);
  }

  @Post(':id/load')
  load(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LoadCardDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.cardsService.loadCard(id, user.userId, BigInt(dto.amount), idempotencyKey);
  }

  @Patch(':id/freeze')
  freeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cardsService.freezeCard(id, user.userId);
  }

  @Patch(':id/unfreeze')
  unfreeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cardsService.unfreezeCard(id, user.userId);
  }
}

// Vues admin — supervision anti-fraude sur l'ensemble des cartes émises (§16).
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/cards')
export class AdminCardsController {
  constructor(private cardsService: CardsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.cardsService.adminList(status);
  }

  @Patch(':id/freeze')
  freeze(@Param('id') id: string) {
    return this.cardsService.adminFreeze(id, true);
  }

  @Patch(':id/unfreeze')
  unfreeze(@Param('id') id: string) {
    return this.cardsService.adminFreeze(id, false);
  }
}
