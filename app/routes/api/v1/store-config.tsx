import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

export async function action({ request }) {
  const user = await getUserOrRedirect(request);
  
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "update_seo_metadata") {
      const metaTitle = formData.get("metaTitle") as string;
      const metaDescription = formData.get("metaDescription") as string;
      const keywordsInput = formData.get("keywords") as string;
    //   const metaImage = formData.get("metaImage") as string;

      // Process keywords: split by comma and trim whitespace
      const keywords = keywordsInput
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0);

      const metadata = {
        metaTitle,
        metaDescription,
        keywords,
        // metaImage,
      };

      const storeConfig = {...user.storeConfig}
      storeConfig.metadata = metadata

      const m = await db.user.update({
        where: { id: user.id },
        data: {storeConfig}
      });
      return ({ success: true, metadata });
    }

    return new Response(null, { status: 400 });
  } catch (error) {
    console.error("Error updating SEO metadata:", error);
    return new Response(null, { status: 500 });
  }
} 