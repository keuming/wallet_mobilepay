import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class SubmitKycDto {
  @IsOptional()
  @IsString()
  merchantId?: string; // absent = dossier particulier (le userId vient du JWT)

  @IsString()
  documentType: string;

  @IsString()
  documentRef: string;
}

export class ReviewKycDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  rejectReason?: string;
}

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

  @Post()
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.kycService.submit({
      userId: dto.merchantId ? undefined : user.userId,
      merchantId: dto.merchantId,
      documentType: dto.documentType,
      documentRef: dto.documentRef,
    });
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listPending() {
    return this.kycService.listPending();
  }

  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kycService.review(id, user.userId, dto.approve, dto.rejectReason);
  }
}
