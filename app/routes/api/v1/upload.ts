import { createMultipart, completeMultipart } from "~/.server/tigris";
import type { Route } from "./+types/upload";
import { createAsset } from "~/.server/assets";
import { getUserOrRedirect } from "~/.server/getters";

export async function action({ request }: Route.ActionArgs) {
  // @todo auth
  const body = await request.json();

  if (body.intent === "complete_multipart_upload") {
    const user = await getUserOrRedirect(request);
    const completedData = await completeMultipart({
      ETags: body.etags,
      key: body.key,
      uploadId: body.uploadId,
    });
    // DB stuff
    await createAsset({
      storageKey: body.key, // required
      userId: user.id, // required
      size: body.size,
      contentType: body.contentType,
      fileMetadata: body.fileMetadata,
    });
    return new Response(JSON.stringify(completedData), {
      headers: { "content-type": "application/json" },
    });
  }

  if (body.intent === "create_multipart_upload") {
    return new Response(
      JSON.stringify(
        await createMultipart({
          numberOfParts: body.numberOfParts,
        })
      )
    );
  }

  return new Response(null);
}
