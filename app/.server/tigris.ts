import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  PutBucketCorsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const PREFIX = "API_EXPERIMENT/";


const S3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
});

const setCors = async (options: {
  MaxAgeSeconds?: number;
  AllowedOrigins?: string[];
}) => {
  const { MaxAgeSeconds = 3600, AllowedOrigins = ["*"] } = options || {};
  const input = {
    Bucket: process.env.BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["PUT", "DELETE", "GET"],
          AllowedOrigins,
          MaxAgeSeconds,
        },
      ],
    },
  };
  const command = new PutBucketCorsCommand(input);
  return await S3.send(command);
};

export const getPutFileUrl = async (options?: {
  storageKey: string;
  timeout?: number;
  UploadId?: string;
  PartNumber?: number;
  cors_origin?: string;
  asset_settings?: { playback: "public" | "private" };
}) => {
  const {
    storageKey,
    asset_settings = { playback: "private" }, // @todo implement
    cors_origin = "*",
    timeout = 3600,
  } = options || {};
  await setCors({
    AllowedOrigins: [cors_origin],
    MaxAgeSeconds: timeout,
  });
  return await getSignedUrl(
    S3,
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: PREFIX + storageKey,
      //   UploadId: UploadId || undefined,
      //   PartNumber: PartNumber || undefined,
    }),
    { expiresIn: timeout }
  );
};

// FOR THE NEW API
export const getDirectUpload = async (options?: {
  timeout?: number;
  status?: string;
  asset_settings?: { playback: string };
  cors_origin?: string;
}) => {
  const {
    timeout = 3600,
    status = "waiting",
    cors_origin = "*",
    asset_settings = { playback: "private" },
  } = options || {};
  const storageKey = randomUUID();
  const url = await getPutFileUrl({ storageKey, timeout, cors_origin });
  return {
    url,
    timeout,
    status,
    asset_settings,
    storageKey,
    cors_origin,
  };
};

// EXPERIMENTING with parts @todo Asign ACL?

export const getMultipartURLs = ({
  UploadId,
  numberOfParts,
  storageKey,
}: {
  storageKey: string;
  UploadId: string;
  numberOfParts: number;
}) => {
  const promises = [];
  for (let i = 0; i < numberOfParts; i += 1) {
    const promise = getPutFileUrl(storageKey, {
      PartNumber: i,
      UploadId,
    });
    promises.push(promise);
  }
  return Promise.all(promises);
};

export const getUploadWithMultiPart = async (storageKey: string) => {
  return await S3.send(
    new CreateMultipartUploadCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: PREFIX + storageKey,
    })
  ).catch((e) => console.error(e));
};

export const fileExist = async (key: string) => {
  return await S3.send(
    new HeadObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: PREFIX + key,
    })
  )
    .then((r) => {
      console.log("::FILE_EXIST:: ", r.ContentType);
      return true;
    })
    .catch((err) => {
      console.error("FILE_MAY_NOT_EXIST", key, err.message);
      return false;
    });
};

export const getReadURL = async (key: string, expiresIn = 3600) => {
  await setCors();
  return await getSignedUrl(
    S3,
    new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: PREFIX + key,
    }),
    { expiresIn }
  );
};

export const getImageURL = async (key: string, expiresIn = 900) =>
  await getSignedUrl(
    S3,
    new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: "animaciones/" + key, // @TODO: update when prod beta
    }),
    { expiresIn }
  );

// borrame

export const getPutVideoExperiment = async () => {
  const key = "videos_experiment/" + randomUUID();
  await setCors();
  return await getSignedUrl(
    S3,
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: 3600 }
  );
};

export const getRemoveFileUrl = async (key: string) => {
  await setCors();
  return await getSignedUrl(
    S3,
    new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: "animaciones/" + key, // @TODO: update when prod beta
    }),
    { expiresIn: 3600 }
  );
};

export const getComboURLs = async (key: string) => ({
  putURL: await getPutFileUrl(key),
  readURL: await getReadURL(key),
  deleteURL: await getRemoveFileUrl(key),
});

// @todo: now is using prefix keys, we can improve
export const removeFilesFor = async (id: string) => {
  const posterDelete = await getRemoveFileUrl("poster-" + id);
  const videoDelete = await getRemoveFileUrl("video-" + id);
  await fetch(posterDelete, { method: "DELETE" });
  await fetch(videoDelete, { method: "DELETE" });
  return true;
};
