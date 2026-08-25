import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletsService } from '../src/modules/wallets/wallets.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PrismaService } from '../src/config/prisma.service';

/**
 * Tests d'intégration sur le point le plus critique du système : le transfert
 * P2P. Nécessite une base Postgres de test (voir DATABASE_URL dans .env.test) —
 * ce ne sont PAS des tests unitaires avec mocks, car la garantie qu'on veut
 * vérifier (SERIALIZABLE + idempotence) est une propriété de Postgres, pas de
 * notre code TypeScript seul.
 *
 * Lancer avec : DATABASE_URL=... npx jest test/wallets.transfer.e2e-spec.ts
 */
describe('WalletsService.transfer (intégration)', () => {
  let wallets: WalletsService;
  let prisma: PrismaService;

  let senderId: string;
  let recipientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WalletsService, LedgerService, PrismaService],
    }).compile();

    wallets = moduleRef.get(WalletsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Recrée deux utilisateurs + wallets propres avant chaque test.
    const sender = await prisma.user.create({
      data: {
        phone: `+225070${Date.now().toString().slice(-7)}`,
        firstName: 'Test',
        lastName: 'Sender',
        passwordHash: 'x',
        wallet: { create: { type: 'PARTICULIER', cachedBalance: 10_000_00n } }, // 10 000 FCFA
      },
    });
    const recipient = await prisma.user.create({
      data: {
        phone: `+225071${Date.now().toString().slice(-7)}`,
        firstName: 'Test',
        lastName: 'Recipient',
        passwordHash: 'x',
        wallet: { create: { type: 'PARTICULIER', cachedBalance: 0n } },
      },
    });
    senderId = sender.id;
    recipientId = recipient.id;
  });

  it('débite l\'expéditeur et crédite le destinataire du même montant', async () => {
    const recipient = await prisma.user.findUniqueOrThrow({ where: { id: recipientId } });

    await wallets.transfer(
      senderId,
      { toPhone: recipient.phone, amount: 5_000_00 },
      `test-key-${Date.now()}`,
    );

    const senderWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: senderId } });
    const recipientWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: recipientId } });

    expect(senderWallet.cachedBalance).toBe(5_000_00n);
    expect(recipientWallet.cachedBalance).toBe(5_000_00n);
  });

  it('rejette un transfert si le solde est insuffisant', async () => {
    const recipient = await prisma.user.findUniqueOrThrow({ where: { id: recipientId } });

    await expect(
      wallets.transfer(
        senderId,
        { toPhone: recipient.phone, amount: 999_999_00 },
        `test-key-${Date.now()}`,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ne débite qu\'une seule fois si la même clé d\'idempotence est rejouée', async () => {
    const recipient = await prisma.user.findUniqueOrThrow({ where: { id: recipientId } });
    const idempotencyKey = `same-key-${Date.now()}`;

    await wallets.transfer(senderId, { toPhone: recipient.phone, amount: 1_000_00 }, idempotencyKey);
    await wallets.transfer(senderId, { toPhone: recipient.phone, amount: 1_000_00 }, idempotencyKey);

    const senderWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: senderId } });
    // Un seul débit de 1 000 FCFA doit avoir eu lieu, pas deux.
    expect(senderWallet.cachedBalance).toBe(9_000_00n);
  });

  it('ne permet jamais au solde de devenir négatif sous deux transferts concurrents', async () => {
    // Deux transferts de 6 000 FCFA chacun, en parallèle, sur un solde de 10 000 FCFA.
    // Un seul doit réussir ; le solde ne doit jamais passer sous zéro.
    const recipient = await prisma.user.findUniqueOrThrow({ where: { id: recipientId } });

    const results = await Promise.allSettled([
      wallets.transfer(senderId, { toPhone: recipient.phone, amount: 6_000_00 }, `concurrent-a-${Date.now()}`),
      wallets.transfer(senderId, { toPhone: recipient.phone, amount: 6_000_00 }, `concurrent-b-${Date.now()}`),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBe(1);

    const senderWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: senderId } });
    expect(senderWallet.cachedBalance).toBeGreaterThanOrEqual(0n);
  });
});
