import { createAsset } from "~/.server/assets";
import type { Route } from "./+types/upload";
import { handler, type Complete } from "react-hook-multipart";
import { getUserOrRedirect } from "~/.server/getters";

export const action = async ({ request }: Route.ActionArgs) => {
  const HOST = process.env.S3_PUBLIC_ENDPOINT || "easybits-dev";
  const user = await getUserOrRedirect(request);
  return await handler(
    request,
    async (complete: Complete) => {
      // create on DB
      createAsset({
        fileMetadata: {
          ...complete.metadata,
          originalName: complete.metadata.name,
        },
        size: complete.size,
        storageKey: complete.key,
        publicLink: `${HOST}/${complete.key}`,
        userId: user.id,
        contentType: complete.contentType,
        status: "uploaded",
      });
      return new Response(JSON.stringify(complete));
    },
    {
      ACL: "public-read",
      // ACL: "private",
    }
  );
};
