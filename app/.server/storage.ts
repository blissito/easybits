import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  PutBucketCorsCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StorageRegion } from "@prisma/client";
import { db } from "./db";

const DEFAULT_PREFIX = "API_EXPERIMENT/";

// --- Types ---

export type StorageClient = {
  getPutUrl(key: string, opts?: { timeout?: number }): Promise<string>;
  getReadUrl(key: string, expiresIn?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  createMultipart(key: string): Promise<{ uploadId: string }>;
  getPutPartUrl(key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, etags: string[]): Promise<void>;
};

// --- Factory ---

function createS3ClientFromConfig(config: {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): { s3: S3Client; bucket: string } {
  const s3 = new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { s3, bucket: config.bucket };
}

async function setCors(s3: S3Client, bucket: string) {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            MaxAgeSeconds: 3600,
            AllowedOrigins: ["*"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            AllowedMethods: ["PUT", "DELETE", "GET"],
          },
        ],
      },
    })
  );
}

function buildStorageClient(s3: S3Client, bucket: string, prefix = DEFAULT_PREFIX): StorageClient {
  return {
    async getPutUrl(key, opts) {
      await setCors(s3, bucket);
      return getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: bucket, Key: prefix + key }),
        { expiresIn: opts?.timeout ?? 3600 }
      );
    },

    async getReadUrl(key, expiresIn = 3600) {
      await setCors(s3, bucket);
      return getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: prefix + key }),
        { expiresIn }
      );
    },

    async deleteObject(key) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: prefix + key })
      );
    },

    async createMultipart(key) {
      const { UploadId } = await s3.send(
        new CreateMultipartUploadCommand({ Bucket: bucket, Key: prefix + key })
      );
      if (!UploadId) throw new Error("Failed to create multipart upload");
      return { uploadId: UploadId };
    },

    async getPutPartUrl(key, uploadId, partNumber) {
      await setCors(s3, bucket);
      return getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: prefix + key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: 3600 }
      );
    },

    async completeMultipart(key, uploadId, etags) {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: prefix + key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: etags.map((ETag, i) => ({ ETag, PartNumber: i + 1 })),
          },
        })
      );
    },
  };
}

// --- Platform Default (Tigris via env vars) ---

const _platformClients = new Map<string, StorageClient>();

export function getPlatformDefaultClient(opts?: { bucket?: string; prefix?: string }): StorageClient {
  const resolvedBucket = opts?.bucket || process.env.BUCKET_NAME;
  const resolvedPrefix = opts?.prefix ?? "mcp/";
  if (!resolvedBucket) {
    throw new Error("Platform storage not configured (missing BUCKET_NAME)");
  }

  const cacheKey = `${resolvedBucket}:${resolvedPrefix}`;
  const cached = _platformClients.get(cacheKey);
  if (cached) return cached;

  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  if (!endpoint) {
    throw new Error("Platform storage not configured (missing AWS_ENDPOINT_URL_S3)");
  }

  const { s3, bucket: b } = createS3ClientFromConfig({
    endpoint,
    region: process.env.AWS_REGION || "auto",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    bucket: resolvedBucket,
  });
  const client = buildStorageClient(s3, b, resolvedPrefix);
  _platformClients.set(cacheKey, client);
  return client;
}

// --- Public API ---

export function createStorageClient(provider: StorageProvider): StorageClient {
  const config = provider.config as {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
  };
  const { s3, bucket } = createS3ClientFromConfig(config);
  return buildStorageClient(s3, bucket);
}

// Cache per provider ID
const _clientCache = new Map<string, StorageClient>();

export async function getClientForProvider(providerId: string): Promise<StorageClient> {
  const cached = _clientCache.get(providerId);
  if (cached) return cached;

  const provider = await db.storageProvider.findUnique({ where: { id: providerId } });
  if (!provider) throw new Error(`Storage provider not found: ${providerId}`);

  const client = createStorageClient(provider);
  _clientCache.set(providerId, client);
  return client;
}

export async function getClientForFile(storageProviderId?: string | null, userId?: string): Promise<StorageClient> {
  // File has explicit provider
  if (storageProviderId) return getClientForProvider(storageProviderId);

  // Fallback: find user's default provider
  if (userId) {
    const provider = await resolveProvider(userId);
    if (provider) return createStorageClient(provider);
  }

  // Fallback: platform default (Tigris)
  return getPlatformDefaultClient();
}

export async function resolveProvider(
  userId: string,
  opts?: { access?: "public" | "private"; region?: StorageRegion }
): Promise<StorageProvider | null> {
  const providers = await db.storageProvider.findMany({
    where: { userId },
    orderBy: { isDefault: "desc" },
  });

  if (providers.length === 0) return null;

  if (opts?.region) {
    const regionMatch = providers.find((p) => p.region === opts.region);
    if (regionMatch) return regionMatch;
  }

  if (opts?.access === "public") {
    const r2 = providers.find((p) => p.type === "CLOUDFLARE_R2");
    if (r2) return r2;
  }

  return providers.find((p) => p.isDefault) || providers[0];
}
