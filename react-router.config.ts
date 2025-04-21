import type { Config } from "@react-router/dev/config";
import { db } from "./app/.server/db";

export default {
  ssr: true,
  // prerender: async () => {
  //   const assets = await db.asset.findMany({
  //     where: { published: true },
  //     select: { slug: true },
  //   });
  //   return ["/"].concat(assets.map((asset) => `/p/${asset.slug}`));
  // },
} satisfies Config;
