/**
 * Solde HUB2 — cause la plus fréquente d'échec des retraits (PAY-OUT).
 *
 * Un dépôt (PAY-IN) crédite le compte "collection". Un retrait puise dans le
 * compte "transfer", qui doit être approvisionné SÉPARÉMENT. S'il est vide,
 * chaque retrait échoue, quel que soit le solde du client chez nous.
 */
require('dotenv').config();

const BASE_URL = process.env.HUB2_BASE_URL || 'https://api.hub2.io';
const headers = {
  'Content-Type': 'application/json',
  ApiKey: process.env.HUB2_API_KEY,
  MerchantId: process.env.HUB2_MERCHANT_ID,
  Environment: process.env.HUB2_ENVIRONMENT || 'live',
};

async function main() {
  if (!headers.ApiKey || !headers.MerchantId) {
    console.error('HUB2_API_KEY / HUB2_MERCHANT_ID absents du .env');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/balances`, { headers });
  const text = await res.text();
  console.log(`\n=== SOLDES HUB2 (HTTP ${res.status}) ===\n`);
  try {
    const data = JSON.parse(text);
    console.log(JSON.stringify(data, null, 2));
    const arr = Array.isArray(data) ? data : data.balances ?? [];
    const transfer = arr.find((b) => String(b.type ?? b.name ?? '').toLowerCase().includes('transfer'));
    if (transfer) {
      const v = Number(transfer.availableBalance ?? transfer.available ?? 0);
      console.log(`\n>>> Solde TRANSFER disponible : ${v.toLocaleString('fr-FR')}`);
      if (v <= 0) {
        console.log('>>> VIDE : c est la cause des echecs de retrait.');
        console.log('>>> Approvisionner le compte transfer depuis le tableau de bord HUB2.\n');
      }
    }
  } catch {
    console.log(text);
  }
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
