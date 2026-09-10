/**
 * Gestion des webhooks HUB2.
 *
 * § Contexte : HUB2 a confirmé que le secret de signature est renvoyé À LA
 * CRÉATION du webhook, via leur API. Si aucun webhook n'a été enregistré de
 * cette façon, HUB2 n'envoie tout simplement rien — ce qui correspond
 * exactement à ce qu'on observe (zéro événement reçu, y compris rejeté).
 *
 * Usage :
 *   node hub2-webhooks.js            → liste les webhooks existants
 *   node hub2-webhooks.js --create   → en crée un et affiche le secret
 */
require('dotenv').config();

const BASE_URL = process.env.HUB2_BASE_URL || 'https://api.hub2.io';
const API_KEY = process.env.HUB2_API_KEY;
const MERCHANT_ID = process.env.HUB2_MERCHANT_ID;
const ENVIRONMENT = process.env.HUB2_ENVIRONMENT || 'live';

const WEBHOOK_URL = 'https://mobilepay-v2-api.onrender.com/api/webhooks/hub2';

const headers = {
  'Content-Type': 'application/json',
  ApiKey: API_KEY,
  MerchantId: MERCHANT_ID,
  Environment: ENVIRONMENT,
};

async function main() {
  if (!API_KEY || !MERCHANT_ID) {
    console.error('HUB2_API_KEY / HUB2_MERCHANT_ID absents du .env');
    process.exit(1);
  }

  const create = process.argv.includes('--create');

  if (!create) {
    console.log('\n=== WEBHOOKS ENREGISTRES CHEZ HUB2 ===\n');
    const res = await fetch(`${BASE_URL}/webhooks`, { headers });
    const text = await res.text();
    console.log(`HTTP ${res.status}`);
    console.log(text);
    console.log('\nSi la liste est vide, relance avec :  node hub2-webhooks.js --create\n');
    return;
  }

  console.log('\n=== CREATION DU WEBHOOK ===\n');
  const res = await fetch(`${BASE_URL}/webhooks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: WEBHOOK_URL,
      // On s'abonne à tous les événements de paiement : le circuit complet
      // (attente → action requise → résultat) doit nous parvenir.
      events: [
        'payment.pending',
        'payment.action_required',
        'payment.succeeded',
        'payment.failed',
        'transfer.succeeded',
        'transfer.failed',
      ],
    }),
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);

  if (res.ok) {
    console.log('\n>>> RECOPIE LE CHAMP "secret" CI-DESSUS DANS RENDER :');
    console.log('    Variable HUB2_WEBHOOK_SECRET, puis redeploie l API.\n');
  }
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
