import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Vérifie et décode le JWT d'accès (voir JwtStrategy). Toute route protégée
// doit porter @UseGuards(JwtAuthGuard).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
