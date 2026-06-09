// Actualiza el OAuthClient de ghosty.studio para whitelistear el callback de
// AMBOS dominios (ghosty.studio + ghosty.formmy.app). Idempotente.
// Uso: npx tsx scripts/add-ghosty-redirect.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CLIENT_ID = "ebc_BIl-cXigZuqyftA1";
const URIS = [
  "https://ghosty.studio/oauth/easybits/callback",
  "https://ghosty.formmy.app/oauth/easybits/callback",
];

async function main() {
  const before = await db.oAuthClient.findUnique({ where: { clientId: CLIENT_ID } });
  if (!before) throw new Error(`OAuthClient ${CLIENT_ID} no existe`);
  console.log("antes:", before.redirectUris);
  const after = await db.oAuthClient.update({
    where: { clientId: CLIENT_ID },
    data: { redirectUris: URIS },
  });
  console.log("después:", after.redirectUris);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
