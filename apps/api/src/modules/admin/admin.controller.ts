import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MerchantStatus, TransactionStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

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

  // --- Particuliers ---
  @Get('users')
  listUsers(@Query('page') page?: string, @Query('search') search?: string) {
    return this.adminService.listUsers(page ? Number(page) : 1, search);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
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

  @Get('merchants/:id')
  getMerchant(@Param('id') id: string) {
    return this.adminService.getMerchantDetail(id);
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

  @Patch('agents/:id/status')
  setAgentStatus(@Param('id') id: string, @Body() dto: SetAgentStatusDto) {
    return this.adminService.setAgentStatus(id, dto.status);
  }

  // --- Transactions ---
  @Get('transactions')
  listTransactions(@Query() query: TransactionFilterQuery) {
    return this.adminService.listTransactions({ ...query, page: query.page ? Number(query.page) : 1 });
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
}
