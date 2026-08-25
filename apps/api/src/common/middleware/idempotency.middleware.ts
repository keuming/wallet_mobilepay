import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

// Toute route financière (transfert, encaissement, top-up, retrait) DOIT porter
// un header `Idempotency-Key` généré côté client (UUID). La clé est ensuite
// persistée en base sur `Transaction.idempotencyKey` (contrainte UNIQUE) —
// si le client rejoue la même requête (perte réseau, double-tap), le service
// concerné doit renvoyer la transaction déjà créée au lieu d'en recréer une.
//
// Ce middleware ne fait qu'exiger la présence du header et le rendre disponible
// sur `req.idempotencyKey` ; c'est au service métier (ex: WalletsService.transfer)
// de faire respecter l'unicité via la contrainte DB + un upsert-like pattern.
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const key = req.header('Idempotency-Key');

    if (!key || key.trim().length < 8) {
      throw new BadRequestException(
        "L'en-tête 'Idempotency-Key' est requis pour cette opération (UUID recommandé).",
      );
    }

    (req as any).idempotencyKey = key;
    next();
  }
}
