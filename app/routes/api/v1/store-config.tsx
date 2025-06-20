import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

export async function action({ request }) {
  const user = await getUserOrRedirect(request);
  
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

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

  if (intent === "update_store_config") {
    const data = JSON.parse(formData.get("data") as string);
    
    // Handle storeConfig updates - preserve existing metadata
    const storeConfig = {...user.storeConfig} as any;
    if (data.metadata) {
      storeConfig.metadata = {...storeConfig.metadata, ...data.metadata};
    }
    
    // Update other storeConfig fields
    Object.assign(storeConfig, data);
    
    await db.user.update({
      where: { id: user.id },
      data: { storeConfig }
    });
    
    return { success: true };
  }

  return new Response(null, { status: 400 });
}