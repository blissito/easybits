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
        metadata: complete.metadata,
        size: complete.size,
        storageKey: complete.key,
        url: `${HOST}/${complete.key}`,
        ownerId: user.id,
        contentType: complete.contentType,
        access: complete.access,
        name: complete.metadata.name,
      });
      return new Response(JSON.stringify(complete));
    },
    { directory: `${user.email}/` }
  );
};
