/**
 * Diagnostic : les webhooks HUB2 arrivent-ils réellement ?
 *
 * Chaque webhook reçu est enregistré dans la table webhook_events, y compris
 * ceux rejetés pour signature invalide. Si cette table ne contient rien de
 * récent, c'est que HUB2 ne nous appelle pas — le problème est alors dans la
 * configuration de l'URL de webhook côté HUB2, pas dans notre code.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 dernières heures

  const events = await prisma.webhookEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      eventType: true,
      status: true,
      transactionId: true,
      createdAt: true,
    },
  });

  console.log(`\n=== WEBHOOKS RECUS (6 dernieres heures) : ${events.length} ===\n`);
  if (events.length === 0) {
    console.log('AUCUN webhook recu.');
    console.log('=> HUB2 ne nous appelle pas. Verifier l URL de webhook dans');
    console.log('   le tableau de bord HUB2 : elle doit pointer vers');
    console.log('   https://mobilepay-v2-api.onrender.com/api/webhooks/hub2\n');
  } else {
    for (const e of events) {
      console.log(
        `${e.createdAt.toISOString()}  ${e.status.padEnd(24)} ${e.eventType.padEnd(26)} tx=${e.transactionId ?? '(aucune)'}`,
      );
    }
  }

  // Dernieres transactions de depot, pour comparer
  const txs = await prisma.transaction.findMany({
    where: { type: 'TOPUP', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      providerRef: true,
      nextActionType: true,
      nextActionUrl: true,
      failureReason: true,
      createdAt: true,
    },
  });

  console.log(`\n=== DERNIERS DEPOTS : ${txs.length} ===\n`);
  for (const t of txs) {
    console.log(`${t.createdAt.toISOString()}  ${t.status.padEnd(12)} providerRef=${t.providerRef ?? '(vide)'}`);
    console.log(`   nextActionType=${t.nextActionType ?? '(vide)'}  url=${t.nextActionUrl ? 'PRESENTE' : '(vide)'}`);
    if (t.failureReason) console.log(`   echec: ${t.failureReason}`);
  }
  console.log('');
}

main()
  .catch((e) => { console.error('Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
