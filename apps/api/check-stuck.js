/**
 * Vérifie auprès de HUB2 le sort réel des transactions bloquées.
 *
 * Ne modifie RIEN : ce script se contente de dire, pour chaque transaction
 * restée en suspens, ce que le provider en pense vraiment. Utile pour
 * mesurer l'argent réellement concerné avant/après un déploiement.
 */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const BASE_URL = process.env.HUB2_BASE_URL || 'https://api.hub2.io';
const API_KEY = process.env.HUB2_API_KEY;
const MERCHANT_ID = process.env.HUB2_MERCHANT_ID;
const ENVIRONMENT = process.env.HUB2_ENVIRONMENT || 'live';

async function main() {
  if (!API_KEY || !MERCHANT_ID) {
    console.error('HUB2_API_KEY / HUB2_MERCHANT_ID absents du .env — impossible d interroger HUB2.');
    process.exit(1);
  }

  const stuck = await prisma.transaction.findMany({
    where: {
      status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
      providerName: 'HUB2',
    },
    include: { paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`\n=== TRANSACTIONS EN SUSPENS : ${stuck.length} ===\n`);

  let moneyAtRisk = 0n;

  for (const tx of stuck) {
    const raw = tx.paymentAttempts[0]?.rawResponse;
    const intentId = raw?.id ?? raw?.payments?.[0]?.intentId;

    let remote = 'inconnu';
    if (intentId && String(intentId).startsWith('pi_')) {
      try {
        const res = await fetch(`${BASE_URL}/payment-intents/${intentId}`, {
          headers: {
            'Content-Type': 'application/json',
            ApiKey: API_KEY,
            MerchantId: MERCHANT_ID,
            Environment: ENVIRONMENT,
          },
        });
        if (res.ok) {
          const json = await res.json();
          const payment = json.payments?.[json.payments.length - 1];
          remote = payment?.status ?? json.status ?? 'inconnu';
        } else {
          remote = `erreur HTTP ${res.status}`;
        }
      } catch (e) {
        remote = `erreur ${e.message}`;
      }
      await new Promise((r) => setTimeout(r, 1200)); // respecte la limite HUB2
    }

    const alert = remote === 'successful' ? '  <-- ARGENT DEBITE NON CREDITE' : '';
    if (remote === 'successful') moneyAtRisk += tx.amount;

    console.log(
      `${tx.createdAt.toISOString()}  ${tx.type.padEnd(10)} ${(Number(tx.amount) / 100).toLocaleString('fr-FR').padStart(10)} FCFA  ` +
        `local=${tx.status.padEnd(11)} hub2=${remote}${alert}`,
    );
  }

  console.log(
    `\n=== MONTANT REELLEMENT CONCERNE : ${(Number(moneyAtRisk) / 100).toLocaleString('fr-FR')} FCFA ===\n`,
  );
  if (moneyAtRisk > 0n) {
    console.log('Ces transactions seront finalisees automatiquement par la reconciliation');
    console.log('une fois l API redeployee avec les derniers correctifs.\n');
  }
}

main()
  .catch((e) => { console.error('Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
