/** Affiche les QR personnels et ce que l'API renverra au payeur. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const qrs = await prisma.qrCode.findMany({
    where: { type: 'PARTICULIER' },
    take: 5,
    include: { ownerUser: { select: { firstName: true, lastName: true, phone: true } } },
  });

  console.log(`\n=== QR PERSONNELS : ${qrs.length} ===\n`);
  for (const q of qrs) {
    console.log(`code   : ${q.code}`);
    console.log(`statut : ${q.status}`);
    console.log(
      `titulaire : ${q.ownerUser ? `${q.ownerUser.firstName} ${q.ownerUser.lastName} — ${q.ownerUser.phone}` : '(AUCUN — c est le probleme)'}`,
    );
    console.log(`test   : curl.exe "https://mobilepay-v2-api.onrender.com/api/qr/${q.code}"`);
    console.log('');
  }
}

main()
  .catch((e) => { console.error('Erreur :', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
