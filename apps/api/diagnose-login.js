/**
 * Diagnostic de connexion — vérifie précisément pourquoi /auth/login renvoie
 * 401 pour ce compte : verrouillage, mot de passe, ou compte introuvable.
 *
 * Usage :
 *   node diagnose-login.js +2250707400716 LE_MOT_DE_PASSE_QUE_TU_UTILISES
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const [, , phone, password] = process.argv;

  if (!phone) {
    console.error('Usage : node diagnose-login.js <numero_+225...> [mot_de_passe_a_tester]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.log(`❌ Aucun compte trouvé pour le numéro exact "${phone}".`);
    console.log(`   Vérifie le format — essaie de lister les comptes proches :`);
    const similar = await prisma.user.findMany({
      where: { phone: { contains: phone.replace('+225', '').slice(-8) } },
      select: { phone: true, firstName: true, lastName: true, role: true },
    });
    console.log(similar);
    process.exit(0);
  }

  console.log(`✅ Compte trouvé : ${user.firstName} ${user.lastName} (${user.role})`);
  console.log(`   Numéro exact en base : ${user.phone}`);
  console.log(`   isBlocked : ${user.isBlocked}`);
  console.log(`   securityFailedAttempts : ${user.securityFailedAttempts}`);
  console.log(`   securityLockedUntil : ${user.securityLockedUntil ?? '(aucun verrou)'}`);
  if (user.securityLockedUntil && user.securityLockedUntil > new Date()) {
    const min = Math.ceil((user.securityLockedUntil.getTime() - Date.now()) / 60000);
    console.log(`   ⚠️  COMPTE ACTUELLEMENT VERROUILLÉ encore ${min} min.`);
  }

  if (password) {
    const valid = await bcrypt.compare(password, user.passwordHash);
    console.log(`\n🔑 Le mot de passe fourni est ${valid ? '✅ CORRECT' : '❌ INCORRECT'} pour ce compte.`);
  } else {
    console.log(`\n(Ajoute le mot de passe en 2e argument pour le vérifier aussi.)`);
  }
}

main()
  .catch((e) => {
    console.error('Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
