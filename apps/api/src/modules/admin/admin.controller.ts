import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsPhoneNumber, IsPositive, IsString, Length, Matches, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantStatus, TransactionStatus } from '@prisma/client';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { PricingService } from '../pricing/pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, ADMIN_ROLE_PRESETS } from '../../common/constants/permissions';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class UpdatePricingDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  percentageBps?: number;

  @IsOptional()
  @IsInt()
  flatFeeCents?: number;

  @IsOptional()
  @IsString()
  label?: string;
}

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
  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir entre 4 et 6 chiffres.' })
  ownerPin?: string;

  @IsOptional()
  @IsIn(['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], { message: 'Pays non pris en charge.' })
  country?: string;

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

export class ResetPasswordDto {
  @IsString()
  @Length(4, 6, { message: 'Le mot de passe doit contenir entre 4 et 6 caractères.' })
  newPassword: string;
}

export class SetPinDto {
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'Le code secret doit contenir entre 4 et 6 chiffres.' })
  newPin: string;
}

// § Administration de l'équipe back-office
export class CreateAdminUserDto {
  @IsString()
  @MinLength(6, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  @Length(4, 6, { message: 'Le mot de passe doit contenir entre 4 et 6 caractères.' })
  password: string;

  @IsOptional()
  @IsString({ each: true })
  @IsIn(ALL_ADMIN_PERMISSIONS, { each: true, message: 'Permission inconnue.' })
  permissions?: string[];
}

export class UpdateAdminPermissionsDto {
  @IsString({ each: true })
  @IsIn(ALL_ADMIN_PERMISSIONS, { each: true, message: 'Permission inconnue.' })
  permissions: string[];
}

export class UpdatePhoneDto {
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide.' })
  newPhone: string;
}

/** Forme minimale d'un fichier Multer — évite de dépendre du type Express.Multer.File (paquet @types/multer absent). */
interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export class RecordManualFundingDto {
  @IsIn(['PARTICULIER', 'MERCHANT'])
  targetType: 'PARTICULIER' | 'MERCHANT';

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsString()
  targetMerchantId?: string;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsIn(['WALLET_RECHARGE', 'AIRTIME_DATA', 'TRANSFER', 'CARD_LOAD', 'BULK_PAYMENT', 'BANK_TRANSFER', 'OTHER'])
  serviceType: string;

  @IsOptional()
  @IsString()
  note?: string;
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
//
// § Depuis l'audit d'administration d'équipe : être ADMIN ne suffit plus à
// tout faire. Chaque endpoint déclare la permission métier qu'il exige
// (voir ADMIN_PERMISSIONS), appliquée par PermissionsGuard. Un compte
// marqué isSuperAdmin conserve un accès complet.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private pricingService: PricingService,
  ) {}

  @RequirePermissions(ADMIN_PERMISSIONS.DASHBOARD_VIEW)
  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  /** Soldes réels HUB2/Reloadly + consommation par opérateur (§ KPIs admin). */
  @RequirePermissions(ADMIN_PERMISSIONS.DASHBOARD_VIEW)
  @Get('kpis/providers')
  getProviderKpis() {
    return this.adminService.getProviderKpis();
  }

  // --- Programme cartes prépayées (VISA/Mastercard) ---
  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('card-fundings/balances')
  getCardProgramBalances() {
    return this.adminService.getCardProgramBalances();
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('card-fundings')
  listCardFundings() {
    return this.adminService.listCardFundings();
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Post('card-fundings')
  createCardFunding(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateCardFundingDto) {
    return this.adminService.createCardFunding({ ...dto, requestedByAdminId: admin.userId });
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Post('card-fundings/:id/confirm')
  confirmCardFunding(@Param('id') id: string) {
    return this.adminService.confirmCardFunding(id);
  }

  // --- Rails de trésorerie indépendants (PayPal, Virement bancaire) ---
  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('fundings/:source')
  listFundingsBySource(@Param('source') source: 'PAYPAL' | 'BANK_TRANSFER') {
    return this.adminService.listFundingsBySource(source);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('fundings/:source/total')
  getFundingSourceTotal(@Param('source') source: 'PAYPAL' | 'BANK_TRANSFER') {
    return this.adminService.getFundingSourceTotal(source);
  }

  // --- Services B2B : Collecte / Bulk Payment ---
  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_VIEW)
  @Get('enterprise-clients/:serviceType')
  listEnterpriseClients(@Param('serviceType') serviceType: 'COLLECTE' | 'BULK_PAYMENT') {
    return this.adminService.listEnterpriseClients(serviceType);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Post('enterprise-clients')
  addEnterpriseClient(@Body() dto: AddEnterpriseClientDto) {
    return this.adminService.addEnterpriseClient(dto.serviceType, dto.merchantId, dto.notes);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Patch('enterprise-clients/:id/remove')
  removeEnterpriseClient(@Param('id') id: string) {
    return this.adminService.removeEnterpriseClient(id);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.TRANSACTIONS_VIEW)
  @Get('enterprise-clients/:id/transactions')
  getEnterpriseClientTransactions(@Param('id') id: string) {
    return this.adminService.getEnterpriseClientTransactions(id);
  }

  // --- Particuliers ---
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  @Get('users')
  listUsers(@Query('page') page?: string, @Query('search') search?: string) {
    return this.adminService.listUsers(page ? Number(page) : 1, search);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  @Post('users')
  createParticulier(@Body() dto: CreateParticulierDto) {
    return this.adminService.createParticulier(dto);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  // --- § Approvisionnement manuel (preuve de remise de fonds) ---

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Post('manual-funding')
  @UseInterceptors(FileInterceptor('proof'))
  async recordManualFunding(
    @Body() dto: RecordManualFundingDto,
    @UploadedFile() file: UploadedMulterFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Le justificatif (image ou PDF) est requis.');
    }
    return this.adminService.recordManualFunding(
      dto,
      { fileName: file.originalname, mimeType: file.mimetype, data: file.buffer.toString('base64') },
      user.userId,
    );
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('manual-funding')
  listManualFundings(@Query('page') page?: string) {
    return this.adminService.listManualFundings(page ? Number(page) : 1);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.FUNDING_MANAGE)
  @Get('manual-funding/:id/proof')
  async getManualFundingProof(@Param('id') id: string, @Res() res: Response) {
    const proof = await this.adminService.getManualFundingProof(id);
    res.setHeader('Content-Type', proof.proofMimeType);
    res.setHeader('Content-Disposition', `inline; filename="${proof.proofFileName}"`);
    res.send(Buffer.from(proof.proofData, 'base64'));
  }

  @RequirePermissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  /** Réinitialise le mot de passe d'un utilisateur (§ compte perdu, sans SMS de récupération). */
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_CREDENTIALS)
  @Patch('users/:id/password')
  resetUserPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetUserPassword(id, dto.newPassword);
  }

  /** Définit/réinitialise le code secret de transaction — particulier ou marchand (les deux sont des User). */
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_CREDENTIALS)
  @Patch('users/:id/pin')
  setUserPin(@Param('id') id: string, @Body() dto: SetPinDto) {
    return this.adminService.setUserPin(id, dto.newPin);
  }

  /** Change le numéro de téléphone d'un utilisateur. */
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  @Patch('users/:id/phone')
  updateUserPhone(@Param('id') id: string, @Body() dto: UpdatePhoneDto) {
    return this.adminService.updateUserPhone(id, dto.newPhone);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  @Patch('users/:id/blocked')
  setUserBlocked(@Param('id') id: string, @Body() dto: SetBlockedDto) {
    return this.adminService.setUserBlocked(id, dto.blocked);
  }

  // --- Marchands ---
  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_VIEW)
  @Get('merchants')
  listMerchants(
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('status') status?: MerchantStatus,
  ) {
    return this.adminService.listMerchants(page ? Number(page) : 1, search, status);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Post('merchants')
  createMerchant(@Body() dto: CreateMerchantByAdminDto) {
    return this.adminService.createMerchant(dto);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_VIEW)
  @Get('merchants/:id')
  getMerchant(@Param('id') id: string) {
    return this.adminService.getMerchantDetail(id);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Patch('merchants/:id')
  updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.adminService.updateMerchant(id, dto);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Patch('merchants/:id/status')
  setMerchantStatus(@Param('id') id: string, @Body() dto: SetMerchantStatusDto) {
    return this.adminService.setMerchantStatus(id, dto.status);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_MANAGE)
  @Patch('merchants/:id/transfers-enabled')
  setMerchantTransfersEnabled(@Param('id') id: string, @Body() dto: SetBlockedDto) {
    return this.adminService.setMerchantTransfersEnabled(id, dto.blocked);
  }

  // --- Agents ---
  @RequirePermissions(ADMIN_PERMISSIONS.MERCHANTS_VIEW)
  @Get('agents')
  listAgents(@Query('page') page?: string) {
    return this.adminService.listAgents(page ? Number(page) : 1);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.AGENTS_MANAGE)
  @Post('agents')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.adminService.createAgent(dto);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.AGENTS_MANAGE)
  @Patch('agents/:id/status')
  setAgentStatus(@Param('id') id: string, @Body() dto: SetAgentStatusDto) {
    return this.adminService.setAgentStatus(id, dto.status);
  }

  // --- Transactions ---
  @RequirePermissions(ADMIN_PERMISSIONS.TRANSACTIONS_VIEW)
  @Get('transactions')
  listTransactions(@Query() query: TransactionFilterQuery) {
    return this.adminService.listTransactions({
      ...query,
      page: query.page ? Number(query.page) : 1,
    });
  }

  @RequirePermissions(ADMIN_PERMISSIONS.TRANSACTIONS_VIEW)
  @Get('transactions/:id')
  getTransactionDetail(@Param('id') id: string) {
    return this.adminService.getTransactionDetail(id);
  }

  // --- QR ---
  @RequirePermissions(ADMIN_PERMISSIONS.QR_MANAGE)
  @Get('qr')
  listQr(@Query('page') page?: string, @Query('status') status?: string) {
    return this.adminService.listQrCodes(page ? Number(page) : 1, status);
  }

  @RequirePermissions(ADMIN_PERMISSIONS.QR_MANAGE)
  @Patch('qr/:code/blocked')
  setQrBlocked(@Param('code') code: string, @Body() dto: SetBlockedDto) {
    return this.adminService.setQrBlocked(code, dto.blocked);
  }

  // --- Providers ---
  @RequirePermissions(ADMIN_PERMISSIONS.PROVIDERS_VIEW)
  @Get('providers')
  getProviders() {
    return this.adminService.getProvidersStatus();
  }

  // --- Tarification (§ paramétrable, sans redéploiement — périodes promo) ---
  @RequirePermissions(ADMIN_PERMISSIONS.PRICING_MANAGE)
  @Get('pricing')
  getPricing() {
    return this.pricingService.getConfig();
  }

  @RequirePermissions(ADMIN_PERMISSIONS.PRICING_MANAGE)
  @Patch('pricing')
  updatePricing(@Body() dto: UpdatePricingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pricingService.updateConfig(
      'PARTICULIER_DEFAULT',
      {
        percentageBps: dto.percentageBps,
        flatFeeCents: dto.flatFeeCents !== undefined ? BigInt(dto.flatFeeCents) : undefined,
        label: dto.label,
      },
      user.userId,
    );
  }

  // ---------------------------------------------------------------------
  // § Administration de l'équipe back-office (§ permissions granulaires)
  // Réservé aux comptes portant ADMIN_TEAM_MANAGE ou isSuperAdmin.
  // ---------------------------------------------------------------------

  /** Catalogue des permissions et profils prédéfinis (pour l'interface). */
  @RequirePermissions(ADMIN_PERMISSIONS.ADMIN_TEAM_MANAGE)
  @Get('team/permissions-catalog')
  getPermissionsCatalog() {
    return {
      permissions: ALL_ADMIN_PERMISSIONS,
      presets: ADMIN_ROLE_PRESETS,
    };
  }

  /** Liste des comptes back-office (rôle ADMIN) avec leurs permissions. */
  @RequirePermissions(ADMIN_PERMISSIONS.ADMIN_TEAM_MANAGE)
  @Get('team')
  listAdminTeam() {
    return this.adminService.listAdminTeam();
  }

  /** Crée un compte back-office. */
  @RequirePermissions(ADMIN_PERMISSIONS.ADMIN_TEAM_MANAGE)
  @Post('team')
  createAdminUser(@Body() dto: CreateAdminUserDto) {
    return this.adminService.createAdminUser(dto);
  }

  /** Met à jour les permissions d'un compte back-office. */
  @RequirePermissions(ADMIN_PERMISSIONS.ADMIN_TEAM_MANAGE)
  @Patch('team/:id/permissions')
  updateAdminPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateAdminPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminService.updateAdminPermissions(id, dto.permissions, user.userId);
  }

  /** Révoque l'accès back-office d'un compte (repasse en PARTICULIER). */
  @RequirePermissions(ADMIN_PERMISSIONS.ADMIN_TEAM_MANAGE)
  @Patch('team/:id/revoke')
  revokeAdminAccess(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.revokeAdminAccess(id, user.userId);
  }
}
