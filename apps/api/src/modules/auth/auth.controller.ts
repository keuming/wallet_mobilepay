import { Body, Controller, Get, Post, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, RegisterWithPinDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class SetInitialPinDto {
  @IsString()
  password: string;

  @IsString()
  pin: string;
}

export class ChangePinDto {
  @IsString()
  currentPin: string;

  @IsString()
  newPin: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Inscription simplifiée — un seul code PIN (§ carte d'accueil après installation). */
  /** Envoie un code de vérification par SMS (§ inscription). */
  @Post('phone/send-otp')
  sendPhoneOtp(@Body('phone') phone: string) {
    return this.authService.sendPhoneOtp(phone);
  }

  /** Vérifie le code reçu par SMS (§ inscription). */
  @Post('phone/verify-otp')
  verifyPhoneOtp(@Body('phone') phone: string, @Body('code') code: string) {
    return this.authService.verifyPhoneOtp(phone, code);
  }

  @Post('register-pin')
  registerWithPin(@Body() dto: RegisterWithPinDto) {
    return this.authService.registerWithPin(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.userId);
  }

  @Get('pin/status')
  @UseGuards(JwtAuthGuard)
  async pinStatus(@CurrentUser() user: AuthenticatedUser) {
    return { hasPin: await this.authService.hasPin(user.userId) };
  }

  @Post('pin')
  @UseGuards(JwtAuthGuard)
  setInitialPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetInitialPinDto) {
    return this.authService.setInitialPin(user.userId, dto.password, dto.pin);
  }

  /** Réinitialisation en cas d'oubli — vérifie le mot de passe, pas l'ancien code. */
  @Post('pin/reset')
  @UseGuards(JwtAuthGuard)
  resetPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetInitialPinDto) {
    return this.authService.resetPin(user.userId, dto.password, dto.pin);
  }

  @Patch('pin')
  @UseGuards(JwtAuthGuard)
  changePin(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePinDto) {
    return this.authService.changePin(user.userId, dto.currentPin, dto.newPin);
  }
}
