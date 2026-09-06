/**
 * Met à jour le prénom/nom d'un compte, identifié par son numéro.
 *
 * Usage :
 *   node update-account-name.js <numero_+225...> "<PRENOM(S)>" "<NOM>"
 *
 * Exemple :
 *   node update-account-name.js +2250713897856 "KEUMINGO REMI" "TOMA"
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [, , phone, firstName, lastName] = process.argv;

  if (!phone || !firstName || !lastName) {
    console.error('Usage : node update-account-name.js <numero_+225...> "<PRENOM(S)>" "<NOM>"');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`Aucun compte trouvé pour le numéro ${phone}.`);
    process.exit(1);
  }

  console.log(`Avant : ${user.firstName} ${user.lastName}`);

  await prisma.user.update({
    where: { id: user.id },
    data: { firstName, lastName },
  });

  console.log(`✅ Après : ${firstName} ${lastName}`);
}

main()
  .catch((e) => {
    console.error('Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
