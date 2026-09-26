const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.qrBatch.findMany({
    select: { id: true, label: true, quantity: true, createdAt: true, _count: { select: { codes: true } } },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Nombre de lots :', batches.length);
  for (const b of batches) {
    console.log(`- ${b.label} : ${b._count.codes} codes reels (attendu: ${b.quantity}) - ${b.createdAt.toISOString()}`);
  }

  const totalCodes = await prisma.qrCode.count();
  console.log('\nTotal QR codes en base (tous lots confondus) :', totalCodes);
}

main().finally(() => prisma.$disconnect());