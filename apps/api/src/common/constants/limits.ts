/**
 * Plafond technique absolu par transaction (§ audit pré-production).
 *
 * Aucun @Max n'existait sur les montants : un montant absurde (ex: 10
 * milliards, ou une valeur proche de la limite d'un entier) passait la
 * validation et n'était rejeté que plus tard — au mieux par le solde
 * insuffisant, au pire en provoquant des calculs de frais aberrants ou un
 * comportement imprévisible côté provider.
 *
 * Ce plafond est une borne de sécurité TECHNIQUE, distincte des plafonds
 * réglementaires par niveau KYC (voir KycLimitsService) qui, eux, restent
 * la vraie limite métier appliquée par utilisateur.
 */
export const MAX_TRANSACTION_AMOUNT_CENTS = 5_000_000_000; // 50 000 000 FCFA
export const MAX_TRANSACTION_AMOUNT_FCFA = 50_000_000;
