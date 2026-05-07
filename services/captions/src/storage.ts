import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";

/**
 * Mirrors env naming from app/.server/storage.ts so the same Fly secrets
 * already provisioned for the easybits app can be reused (or copied).
 */
function makeClient(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint) throw new Error("AWS_ENDPOINT_URL_S3 missing");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing");
  }
  return new S3Client({
    region: process.env.AWS_REGION || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export async function uploadPublic(
  filePath: string,
  key: string,
  contentType = "video/mp4",
): Promise<string> {
  const bucket = process.env.PUBLIC_BUCKET_NAME || "easybits-public";

  const s3 = makeClient();
  const body = readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const endpoint = process.env.AWS_ENDPOINT_URL_S3!;
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/${bucket}/${key}`;
}
