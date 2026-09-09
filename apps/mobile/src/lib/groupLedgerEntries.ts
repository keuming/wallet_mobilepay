interface TransactionRef {
  reference: string;
  type: string;
  status: string;
}

export interface LedgerEntryLike {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  createdAt: string;
  transaction: TransactionRef;
  counterparty: { type: 'PARTICULIER' | 'MERCHANT'; name: string; phone: string | null } | null;
}

export interface GroupedEntry {
  key: string;
  main: LedgerEntryLike;
  feeAmount: number | null;
}

/**
 * Un paiement marchand génère 2 écritures de ledger distinctes pour le payeur
 * (le montant net vers le marchand + les frais MobilePay séparément), toutes
 * deux rattachées à la même transaction. Plutôt que d'afficher 2 lignes pour
 * une seule opération, on les regroupe ici en une seule ligne avec le frais
 * affiché en complément — sans toucher à la comptabilité (double entrée)
 * elle-même, qui reste correcte côté backend.
 */
export function groupLedgerEntries(entries: LedgerEntryLike[]): GroupedEntry[] {
  const byReference = new Map<string, LedgerEntryLike[]>();
  for (const entry of entries) {
    const ref = entry.transaction.reference;
    if (!byReference.has(ref)) byReference.set(ref, []);
    byReference.get(ref)!.push(entry);
  }

  const rows: GroupedEntry[] = [];
  for (const [ref, group] of byReference) {
    const feeEntry = group.find((e) => e.description === 'Frais MobilePay');
    const mainEntry = group.find((e) => e.description !== 'Frais MobilePay') ?? group[0];
    rows.push({ key: ref, main: mainEntry, feeAmount: feeEntry ? feeEntry.amount : null });
  }

  rows.sort((a, b) => new Date(b.main.createdAt).getTime() - new Date(a.main.createdAt).getTime());
  return rows;
}
