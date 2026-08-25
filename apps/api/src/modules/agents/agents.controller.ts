import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class GenerateBatchDto {
  @IsString()
  label: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class LinkQrDto {
  @IsString()
  qrCode: string;

  @IsString()
  merchantId: string;
}

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private agentsService: AgentsService) {}

  @Get('dashboard')
  async myDashboard(@CurrentUser() user: AuthenticatedUser) {
    // Le profil agent est retrouvé via userId — simplifié ici pour le MVP ;
    // un vrai guard AgentScopeGuard suivrait le même pattern que MerchantScopeGuard.
    return this.agentsService.getPerformance(user.userId);
  }

  @Post('qr-batches')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  generateBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateBatchDto) {
    return this.agentsService.generateBatch(user.userId, dto.label, dto.quantity);
  }

  @Post('qr/link')
  linkQr(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkQrDto) {
    return this.agentsService.linkQrToMerchant(user.userId, dto.qrCode, dto.merchantId);
  }
}
