import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsPhoneNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { MerchantStatus, TransactionStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class CreateCardFundingDto {
  @IsOptional()
  @IsIn(['VISA', 'MASTERCARD'])
  brand?: 'VISA' | 'MASTERCARD';

  @IsIn(['BANK_TRANSFER', 'PAYPAL', 'MANUAL'])
  source: 'BANK_TRANSFER' | 'PAYPAL' | 'MANUAL';

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class SetBlockedDto {
  @IsBoolean()
  blocked: boolean;
}

export class SetMerchantStatusDto {
  @IsEnum(MerchantStatus)
  status: MerchantStatus;
}

export class SetAgentStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}

export class CreateParticulierDto {
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe temporaire doit contenir au moins 8 caractères.' })
  password: string;
}

export class CreateAgentDto extends CreateParticulierDto {
  @IsOptional()
  @IsString()
  zone?: string;
}

export class CreateMerchantByAdminDto {
  @IsString()
  businessName: string;

  @IsString()
  category: string;

  @IsPhoneNumber(undefined, { message: 'Numéro du titulaire invalide.' })
  ownerPhone: string;

  @IsString()
  ownerFirstName: string;

  @IsString()
  ownerLastName: string;

  @IsOptional()
  @IsInt()
  feeRateBps?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  feeRateBps?: number;
}

export class AddEnterpriseClientDto {
  @IsIn(['COLLECTE', 'BULK_PAYMENT'])
  serviceType: 'COLLECTE' | 'BULK_PAYMENT';

  @IsString()
  merchantId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransactionFilterQuery {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

// Toutes les routes de ce controller sont réservées à l'administrateur
// plateforme — c'est le back-office principal MobilePay (§16).
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  /** Soldes réels HUB2/Reloadly + consommation par opérateur (§ KPIs admin). */
  @Get('kpis/providers')
  getProviderKpis() {
    return this.adminService.getProviderKpis();
  }

  // --- Programme cartes prépayées (VISA/Mastercard) ---
  @Get('card-fundings/balances')
  getCardProgramBalances() {
    return this.adminService.getCardProgramBalances();
  }

  @Get('card-fundings')
  listCardFundings() {
    return this.adminService.listCardFundings();
  }

  @Post('card-fundings')
  createCardFunding(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateCardFundingDto) {
    return this.adminService.createCardFunding({ ...dto, requestedByAdminId: admin.userId });
  }

  @Post('card-fundings/:id/confirm')
  confirmCardFunding(@Param('id') id: string) {
    return this.adminService.confirmCardFunding(id);
  }

  // --- Rails de trésorerie indépendants (PayPal, Virement bancaire) ---
  @Get('fundings/:source')
  listFundingsBySource(@Param('source') source: 'PAYPAL' | 'BANK_TRANSFER') {
    return this.adminService.listFundingsBySource(source);
  }

  @Get('fundings/:source/total')
  getFundingSourceTotal(@Param('source') source: 'PAYPAL' | 'BANK_TRANSFER') {
    return this.adminService.getFundingSourceTotal(source);
  }

  // --- Services B2B : Collecte / Bulk Payment ---
  @Get('enterprise-clients/:serviceType')
  listEnterpriseClients(@Param('serviceType') serviceType: 'COLLECTE' | 'BULK_PAYMENT') {
    return this.adminService.listEnterpriseClients(serviceType);
  }

  @Post('enterprise-clients')
  addEnterpriseClient(@Body() dto: AddEnterpriseClientDto) {
    return this.adminService.addEnterpriseClient(dto.serviceType, dto.merchantId, dto.notes);
  }

  @Patch('enterprise-clients/:id/remove')
  removeEnterpriseClient(@Param('id') id: string) {
    return this.adminService.removeEnterpriseClient(id);
  }

  @Get('enterprise-clients/:id/transactions')
  getEnterpriseClientTransactions(@Param('id') id: string) {
    return this.adminService.getEnterpriseClientTransactions(id);
  }

  // --- Particuliers ---
  @Get('users')
  listUsers(@Query('page') page?: string, @Query('search') search?: string) {
    return this.adminService.listUsers(page ? Number(page) : 1, search);
  }

  @Post('users')
  createParticulier(@Body() dto: CreateParticulierDto) {
    return this.adminService.createParticulier(dto);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Patch('users/:id/blocked')
  setUserBlocked(@Param('id') id: string, @Body() dto: SetBlockedDto) {
    return this.adminService.setUserBlocked(id, dto.blocked);
  }

  // --- Marchands ---
  @Get('merchants')
  listMerchants(
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('status') status?: MerchantStatus,
  ) {
    return this.adminService.listMerchants(page ? Number(page) : 1, search, status);
  }

  @Post('merchants')
  createMerchant(@Body() dto: CreateMerchantByAdminDto) {
    return this.adminService.createMerchant(dto);
  }

  @Get('merchants/:id')
  getMerchant(@Param('id') id: string) {
    return this.adminService.getMerchantDetail(id);
  }

  @Patch('merchants/:id')
  updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.adminService.updateMerchant(id, dto);
  }

  @Patch('merchants/:id/status')
  setMerchantStatus(@Param('id') id: string, @Body() dto: SetMerchantStatusDto) {
    return this.adminService.setMerchantStatus(id, dto.status);
  }

  // --- Agents ---
  @Get('agents')
  listAgents(@Query('page') page?: string) {
    return this.adminService.listAgents(page ? Number(page) : 1);
  }

  @Post('agents')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.adminService.createAgent(dto);
  }

  @Patch('agents/:id/status')
  setAgentStatus(@Param('id') id: string, @Body() dto: SetAgentStatusDto) {
    return this.adminService.setAgentStatus(id, dto.status);
  }

  // --- Transactions ---
  @Get('transactions')
  listTransactions(@Query() query: TransactionFilterQuery) {
    return this.adminService.listTransactions({
      ...query,
      page: query.page ? Number(query.page) : 1,
    });
  }

  // --- QR ---
  @Get('qr')
  listQr(@Query('page') page?: string, @Query('status') status?: string) {
    return this.adminService.listQrCodes(page ? Number(page) : 1, status);
  }

  @Patch('qr/:code/blocked')
  setQrBlocked(@Param('code') code: string, @Body() dto: SetBlockedDto) {
    return this.adminService.setQrBlocked(code, dto.blocked);
  }

  // --- Providers ---
  @Get('providers')
  getProviders() {
    return this.adminService.getProvidersStatus();
  }
}
