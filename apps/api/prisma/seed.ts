import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // --- Particuliers ---
  const jean = await prisma.user.upsert({
    where: { phone: '+2250700000001' },
    update: {},
    create: {
      phone: '+2250700000001',
      firstName: 'Jean',
      lastName: 'Kouassi',
      passwordHash,
      role: 'PARTICULIER',
      kycLevel: 'LEVEL_1',
      wallet: { create: { type: 'PARTICULIER', cachedBalance: 25_000_00n } }, // 25 000 FCFA
    },
  });

  const awa = await prisma.user.upsert({
    where: { phone: '+2250700000002' },
    update: {},
    create: {
      phone: '+2250700000002',
      firstName: 'Awa',
      lastName: 'Traoré',
      passwordHash,
      role: 'PARTICULIER',
      kycLevel: 'LEVEL_1',
      wallet: { create: { type: 'PARTICULIER', cachedBalance: 10_000_00n } },
    },
  });

  // --- Admin plateforme ---
  await prisma.user.upsert({
    where: { phone: '+2250700000099' },
    update: {},
    create: {
      phone: '+2250700000099',
      firstName: 'Admin',
      lastName: 'MobilePay',
      passwordHash,
      role: 'ADMIN',
      kycLevel: 'LEVEL_3',
    },
  });

  // Compte admin par défaut demandé par Toma — mot de passe dédié distinct
  // du mot de passe partagé de démo ci-dessus.
  const defaultAdminPasswordHash = await bcrypt.hash('301219', 12);
  await prisma.user.upsert({
    where: { phone: '+2250707400716' },
    update: {},
    create: {
      phone: '+2250707400716',
      firstName: 'Admin',
      lastName: 'Principal',
      passwordHash: defaultAdminPasswordHash,
      role: 'ADMIN',
      kycLevel: 'LEVEL_3',
    },
  });

  // --- Marchand actif de démo ---
  const merchantOwner = await prisma.user.upsert({
    where: { phone: '+2250700000003' },
    update: {},
    create: {
      phone: '+2250700000003',
      firstName: 'Koffi',
      lastName: 'N\'Guessan',
      passwordHash,
      role: 'MERCHANT_USER',
      kycLevel: 'LEVEL_2',
    },
  });

  const merchant = await prisma.merchant.upsert({
    where: { id: 'seed-merchant-demo' },
    update: {},
    create: {
      id: 'seed-merchant-demo',
      businessName: 'Maquis Chez Koffi',
      category: 'Restauration',
      status: 'ACTIVE',
      wallet: { create: { type: 'MERCHANT', cachedBalance: 0n } },
      users: { create: { userId: merchantOwner.id, role: 'MERCHANT_ADMIN' } },
      qrCodes: {
        create: { code: 'MPMDEMOMERCHANT01', type: 'MERCHANT_STATIC', status: 'ACTIVE' },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed terminé :');
  console.log(`  Particulier 1 : ${jean.phone} / Password123!`);
  console.log(`  Particulier 2 : ${awa.phone} / Password123!`);
  console.log(`  Marchand      : ${merchantOwner.phone} / Password123! (merchantId=${merchant.id})`);
  console.log(`  Admin         : +2250700000099 / Password123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
