/**
 * Réinitialise le mot de passe de connexion d'un compte (distinct du code
 * secret de transaction — voir unlock-and-reset-pin.js pour celui-là).
 *
 * Usage :
 *   node reset-password.js +2250713897856 NouveauMdp
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const [, , phone, newPassword] = process.argv;

  if (!phone || !newPassword) {
    console.error('Usage : node reset-password.js <numero_+225...> <nouveau_mot_de_passe>');
    process.exit(1);
  }
  if (newPassword.length < 4 || newPassword.length > 6) {
    console.error('Le mot de passe doit contenir entre 4 et 6 caractères.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`Aucun compte trouvé pour le numéro ${phone}.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      securityFailedAttempts: 0,
      securityLockedUntil: null,
    },
  });

  console.log(`✅ Compte ${phone} (${user.firstName} ${user.lastName}) :`);
  console.log(`   - Mot de passe de connexion réinitialisé : ${newPassword}`);
  console.log(`   - Compteur d'échecs remis à zéro`);
}

main()
  .catch((e) => {
    console.error('Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
