interface ReceiptParams {
  reference: string;
  typeLabel: string;
  amount: number; // centimes
  direction: 'CREDIT' | 'DEBIT';
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  description: string;
  status: string;
  date: string;
}

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

function buildReceiptText(p: ReceiptParams): string {
  const lines = [
    'MobilePay CI — Reçu de transaction',
    '─────────────────────────────',
    `Référence : ${p.reference}`,
    `Type : ${p.typeLabel}`,
    `Montant : ${p.direction === 'CREDIT' ? '+' : '−'} ${fcfa(p.amount)}`,
  ];
  if (p.counterpartyName) {
    lines.push(`Correspondant : ${p.counterpartyName}${p.counterpartyPhone ? ` (${p.counterpartyPhone})` : ''}`);
  }
  lines.push(`Motif : ${p.description}`);
  lines.push(`Statut : ${p.status}`);
  lines.push(`Date : ${new Date(p.date).toLocaleString('fr-FR')}`);
  lines.push('─────────────────────────────');
  lines.push('Généré depuis l\'app MobilePay CI');
  return lines.join('\n');
}

/**
 * Partage un reçu via le menu de partage natif du navigateur (WhatsApp, SMS,
 * email...) quand disponible ; sinon copie le texte dans le presse-papiers.
 */
export async function shareReceipt(p: ReceiptParams): Promise<'shared' | 'copied' | 'failed'> {
  const text = buildReceiptText(p);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Reçu MobilePay CI', text });
      return 'shared';
    } catch {
      // L'utilisateur a annulé le partage, ou l'API a échoué silencieusement —
      // dans les deux cas on retombe sur la copie presse-papiers ci-dessous.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
