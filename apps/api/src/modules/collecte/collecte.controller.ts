import { Body, Controller, Delete, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';
import { CollecteService } from './collecte.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class CreateCollectionTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class CollecteMoveDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @MinLength(4)
  pin: string;
}

export class GoldMoveDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @MinLength(4)
  pin: string;
}

@ApiTags('collecte')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CollecteController {
  constructor(private collecteService: CollecteService) {}

  @Get('collecte/types')
  listTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.collecteService.listTypes(user.userId);
  }

  @Post('collecte/types')
  createType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionTypeDto) {
    return this.collecteService.createType(user.userId, dto.label, dto.icon);
  }

  @Delete('collecte/types/:id')
  deleteType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.collecteService.deleteType(user.userId, id);
  }

  @Post('collecte/types/:id/deposit')
  deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CollecteMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.deposit(user.userId, id, dto.amount, dto.pin, idempotencyKey);
  }

  @Post('collecte/types/:id/withdraw')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CollecteMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.withdraw(user.userId, id, dto.amount, dto.pin, idempotencyKey);
  }

  @Post('gold/deposit')
  depositGold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GoldMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.depositGold(user.userId, dto.amount, dto.pin, idempotencyKey);
  }

  @Post('gold/withdraw')
  withdrawGold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GoldMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.withdrawGold(user.userId, dto.amount, dto.pin, idempotencyKey);
  }

  // ---------- Types d'épargne (§ "Épargne Gold" — pots multiples) ----------

  @Get('savings/types')
  listSavingsTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.collecteService.listSavingsTypes(user.userId);
  }

  @Post('savings/types')
  createSavingsType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionTypeDto) {
    return this.collecteService.createSavingsType(user.userId, dto.label, dto.icon);
  }

  @Delete('savings/types/:id')
  deleteSavingsType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.collecteService.deleteSavingsType(user.userId, id);
  }

  @Post('savings/types/:id/deposit')
  depositSavings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CollecteMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.depositSavings(user.userId, id, dto.amount, dto.pin, idempotencyKey);
  }

  @Post('savings/types/:id/withdraw')
  withdrawSavings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CollecteMoveDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.collecteService.withdrawSavings(user.userId, id, dto.amount, dto.pin, idempotencyKey);
  }
}
