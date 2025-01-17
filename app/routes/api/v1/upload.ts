import { createAsset } from "~/.server/assets";
import type { Route } from "./+types/upload";
import { handler } from "react-hook-multipart";
import { getUserOrRedirect } from "~/.server/getters";
// import { handler } from "~/borrame/experiment";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  return await handler(request, async (complete) => {
    // create on DB
    createAsset({
      fileMetadata: {
        ...complete.metadata,
        originalName: complete.metadata.name,
      },
      size: complete.size,
      storageKey: complete.key,
      userId: user.id,
      contentType: complete.contentType,
      status: "uploaded",
    });
    return new Response(JSON.stringify(complete));
  });
};
