import {
  completeMultipart,
  copyObjectToSetContentType,
  getDirectUpload,
  getMultipart,
} from "~/.server/tigris";
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
  // Multipart stuff
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "complete_multipart_upload") {
    const fileName = formData.get("fileName") as string;
    const contentType = formData.get("contentType") as string;
    const fileSize = formData.get("fileSize") as string;
    const uploadId = formData.get("uploadId") as string;
    const ETags = JSON.parse(formData.get("ETags") as string);
    const multipartUploadResult = await completeMultipart({
      uploadId,
      ETags,
      fileName,
    });
    console.info("::MULTIPART_COMPLETED::", multipartUploadResult);
    // await copyObjectToSetContentType(fileName, contentType);
    await createAsset({
      storageKey: "API_EXPERIMENT/" + fileName,
      userId: user.id,
      size: Number(fileSize),
      contentType,
    });
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CopyObjectCommand/
    return new Response(JSON.stringify({ multipartUploadResult }), {
      status: 201,
    });
  }

  if (intent === "start_multipart_upload") {
    const fileName = formData.get("fileName") as string;
    const numberOfParts = Number(formData.get("numberOfParts"));
    if (!fileName || isNaN(numberOfParts))
      throwStatus({
        status: 400,
        message: "Missing fileName or numberOfParts or both",
      });

    const data = await getMultipart({
      fileName,
      numberOfParts,
    });
    return new Response(JSON.stringify(data));
  }

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
