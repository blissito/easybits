import { getDirectUpload } from "~/.server/tigris";
import type { Route } from "./+types/direct-uploads";
import { createAsset } from "~/.server/assets";
import { db } from "~/.server/db";
import { equal } from "assert";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return null;
  //   const body = await request.json();
  //   console.log("BODYÇ: ", body);
  const publicKey = request.headers.get("Authorization");
  // validate auth
  if (!publicKey) throw new Response("Access Denied", { status: 403 });
  const user = await db.user.findUnique({
    where: { publicKey },
  });
  if (!user)
    throw new Response(JSON.stringify({ message: "User Not Found" }), {
      status: 404,
    });
  // create asset and return response
  const data = await getDirectUpload();
  await createAsset({ ...data, userId: user.id });
  return new Response(JSON.stringify(data));
};

export const loader = () => {
  return new Response(
    JSON.stringify({ message: "t(*_*t)", madeBy: "fixter.org" })
  );
};
