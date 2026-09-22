const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.transaction.findMany({
    where: {
      type: 'AIRTIME',
      status: 'FAILED',
      failureReason: { contains: 'remboursement', mode: 'insensitive' },
    },
    select: {
      id: true,
      amount: true,
      feeAmount: true,
      providerRef: true,
      operatorId: true,
      failureReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (stuck.length === 0) {
    console.log('\nAucune transaction bloquee trouvee.\n');
    return;
  }

  console.log('\n=== ' + stuck.length + ' transaction(s) a rembourser manuellement ===\n');
  for (const tx of stuck) {
    const montantFcfa = Number(tx.amount) / 100;
    const fraisFcfa = Number(tx.feeAmount) / 100;
    const totalCollecte = montantFcfa + fraisFcfa;
    console.log('ID transaction ORZAYAH : ' + tx.id);
    console.log('Reference HUB2 (providerRef) : ' + (tx.providerRef ?? 'absente'));
    console.log('Operateur Reloadly : ' + tx.operatorId);
    console.log('Montant credit demande : ' + montantFcfa + ' FCFA');
    console.log('Frais ORZAYAH : ' + fraisFcfa + ' FCFA');
    console.log('>>> TOTAL COLLECTE CHEZ LE CLIENT : ' + totalCollecte + ' FCFA <<<');
    console.log('Date : ' + tx.createdAt.toISOString());
    console.log('Raison : ' + tx.failureReason);
    console.log('---');
  }
  console.log('\nPour chaque ligne, recherche la Reference HUB2 dans ton tableau de');
  console.log('bord HUB2 et declenche le remboursement du montant total collecte.\n');
}

main()
  .catch((e) => { console.error('Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());