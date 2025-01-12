import { getDirectUpload } from "~/.server/tigris";
import type { Route } from "./+types/direct-uploads";
import { createAsset } from "~/.server/assets";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return null;

  const publicKey = request.headers.get("Authorization");
  // validate auth
  if (!publicKey) return throwStatus({ status: 403, message: "Access Denied" });
  const user = await db.user.findUnique({
    where: { publicKey },
  });
  if (!user) return throwStatus();
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

export const throwStatus = (options?: {
  status?: number;
  message?: string;
}) => {
  const { status = 404, message = "Not found" } = options || {};
  throw new Response(JSON.stringify({ message }), {
    status: status,
  });
};
