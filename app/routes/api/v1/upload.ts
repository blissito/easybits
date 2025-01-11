import { getMultipart } from "~/.server/tigris";
import type { Route } from "./+types/upload";

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  if (body.intent === "create_multipart_upload") {
    console.log("BODY: ", body);
    return new Response(
      JSON.stringify(
        await getMultipart({
          numberOfParts: body.numberOfParts,
        })
      )
    );
  }
  return new Response(null);
}
