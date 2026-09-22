const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const attempts = await prisma.paymentAttempt.findMany({
    where: { transactionId: 'ca4068ae-bb93-478a-90a8-314af759d938' },
    select: { providerName: true, status: true, rawResponse: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify(attempts, null, 2));
}
main().finally(() => prisma.$disconnect());