import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const WEBSITE_ID = "69e7907b17008ac8d2f0d08f";
const NEW_SLUG = "blissmo-power";

async function main() {
  const target = await db.website.findUnique({ where: { id: WEBSITE_ID } });
  if (!target) throw new Error(`Website ${WEBSITE_ID} not found`);
  console.log(`Target: ${target.name} — current slug: ${target.slug}`);

  const collision = await db.website.findFirst({
    where: {
      slug: NEW_SLUG,
      status: { not: "DELETED" },
      NOT: { id: WEBSITE_ID },
    },
    select: { id: true, ownerId: true, name: true },
  });
  if (collision) {
    throw new Error(
      `Slug "${NEW_SLUG}" already taken by website ${collision.id} (owner ${collision.ownerId}, name "${collision.name}")`
    );
  }

  const updated = await db.website.update({
    where: { id: WEBSITE_ID },
    data: { slug: NEW_SLUG },
  });
  console.log(`Updated slug: ${target.slug} → ${updated.slug}`);
  console.log(`URL: https://www.easybits.cloud/s/${updated.slug}/`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
