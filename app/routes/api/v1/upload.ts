import type { Route } from "./+types/upload";
import { handler, type Complete } from "react-hook-multipart";
import { getUserOrRedirect } from "~/.server/getters";
import { createFile } from "~/.server/files";

export const action = async ({ request }: Route.ActionArgs) => {
  const HOST = process.env.S3_PUBLIC_ENDPOINT;
  const user = await getUserOrRedirect(request);
  // @todo hide this inside the library
  return await handler(
    request,
    async (complete: Complete) => {
      // create on DB
      await createFile({
        status: "DONE",
        metadata: complete.metadata,
        size: complete.size,
        storageKey: complete.key,
        url: `${HOST}/${complete.key}`,
        ownerId: user.id,
        contentType: complete.contentType,
        access: complete.access, // @todo fix type?
        name: complete.metadata?.name,
        actionId: complete.data?.actionId,
        assetIds: complete.data?.assetId ? [complete.data.assetId] : undefined, // new
      });
      return new Response(JSON.stringify(complete));
    },
    { directory: `${user.id}/` }
  );
};
