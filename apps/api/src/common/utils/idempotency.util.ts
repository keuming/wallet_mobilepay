import { BadRequestException } from '@nestjs/common';

/**
 * Défense en profondeur contre les doubles débits (§ audit pré-production).
 *
 * Le middleware IdempotencyMiddleware exige déjà la présence de l'en-tête
 * sur les routes financières, mais il suffit d'oublier d'y déclarer une
 * nouvelle route pour que la protection saute silencieusement : la clé vaut
 * alors `undefined`, aucune transaction existante n'est trouvée, et une
 * NOUVELLE transaction est créée à chaque rejeu — donc un double débit réel.
 *
 * Cette vérification, appelée dans chaque service financier, garantit qu'un
 * tel oubli échoue bruyamment (erreur claire) plutôt que de coûter de
 * l'argent à un client.
 */
export function assertIdempotencyKey(key: string | undefined | null): string {
  if (!key || key.trim().length < 8) {
    throw new BadRequestException(
      "L'en-tête 'Idempotency-Key' est requis pour cette opération (UUID recommandé).",
    );
  }
  return key;
}
