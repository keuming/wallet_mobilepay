/**
 * Script d'urgence : débloque le compte et réinitialise le code secret de
 * transaction pour le numéro donné (§ compte verrouillé par le mécanisme
 * anti-force-brute après les nombreux tests de connexion d'aujourd'hui).
 *
 * Usage :
 *   cd apps\api
 *   node unlock-and-reset-pin.js +2250707400716 NOUVEAU_PIN
 *
 * Exemple :
 *   node unlock-and-reset-pin.js +2250707400716 1234
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const [, , phone, newPin] = process.argv;

  if (!phone || !newPin) {
    console.error('Usage : node unlock-and-reset-pin.js <numero_complet_+225...> <nouveau_pin_4_a_6_chiffres>');
    process.exit(1);
  }
  if (!/^\d{4,6}$/.test(newPin)) {
    console.error('Le code secret doit contenir entre 4 et 6 chiffres.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`Aucun compte trouvé pour le numéro ${phone}.`);
    process.exit(1);
  }

  const pinHash = await bcrypt.hash(newPin, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      transactionPinHash: pinHash,
      securityFailedAttempts: 0,
      securityLockedUntil: null,
      isBlocked: false,
    },
  });

  console.log(`✅ Compte ${phone} (${user.firstName} ${user.lastName}, rôle ${user.role}) :`);
  console.log(`   - Déverrouillé (compteur d'échecs remis à zéro)`);
  console.log(`   - Nouveau code secret défini : ${newPin}`);
  console.log(`\n⚠️  Recommandation : change ce code depuis l'app dès que possible (menu → Modifier mon code secret), pour que lui seul le connaisse.`);
}

main()
  .catch((e) => {
    console.error('Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
