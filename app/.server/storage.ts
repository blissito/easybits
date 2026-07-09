import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  PutBucketCorsCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StorageRegion } from "@prisma/client";
import { db } from "./db";

const DEFAULT_PREFIX = "API_EXPERIMENT/";

export const PRIVATE_BUCKET = process.env.BUCKET_NAME || "easybits-dev";
export const PUBLIC_BUCKET = process.env.PUBLIC_BUCKET_NAME || "easybits-public";

// Public assets are served straight from the Tigris direct endpoint
// (`<bucket>.t3.storage.dev`). The legacy Acceleration Gateway host
// (`<bucket>.fly.storage.tigris.dev`) is no longer used for serving: it
// regressed to returning `200` + a correct `content-length` but streaming ZERO
// bytes for the `easybits-public` bucket (data intact at origin — the same
// objects serve fine via `t3.storage.dev`). Override with PUBLIC_ASSET_HOST.
export const PUBLIC_ASSET_HOST = process.env.PUBLIC_ASSET_HOST || "t3.storage.dev";
const LEGACY_PUBLIC_HOST_SUFFIX = ".fly.storage.tigris.dev";

// Rewrite any URL still pointing at the broken legacy gateway to the working
// direct host. Safe on any string (unchanged if it doesn't match). Call this
// wherever a possibly-old stored URL is handed back to a client/agent so
// historical `File.url` rows keep resolving even before the DB migration runs.
export function normalizePublicAssetUrl(url: string): string;
export function normalizePublicAssetUrl(url: null | undefined): "";
export function normalizePublicAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.split(LEGACY_PUBLIC_HOST_SUFFIX).join(`.${PUBLIC_ASSET_HOST}`);
}

// --- Types ---

export type StorageClient = {
  getPutUrl(key: string, opts?: { timeout?: number }): Promise<string>;
  getReadUrl(key: string, expiresIn?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  listObjects(): Promise<{ key: string; lastModified?: Date }[]>;
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
            AllowedOrigins: [
              "https://www.easybits.cloud",
              "https://easybits.cloud",
              "https://*.easybits.cloud",
              ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:5173"] : []),
            ],
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

    async putObject(key, body: Buffer, contentType: string) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: prefix + key, Body: body, ContentType: contentType })
      );
    },

    // List all objects under this client's prefix. Returns keys WITHOUT the
    // prefix (symmetric to putObject/deleteObject, which prepend it), so callers
    // pass the returned key straight back to deleteObject. Paginates fully.
    async listObjects() {
      const out: { key: string; lastModified?: Date }[] = [];
      let ContinuationToken: string | undefined;
      do {
        const res = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken })
        );
        for (const o of res.Contents ?? []) {
          if (!o.Key) continue;
          out.push({ key: o.Key.slice(prefix.length), lastModified: o.LastModified });
        }
        ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return out;
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

/**
 * Returns the correct storage client for reading a platform file,
 * handling the mcp/ vs root prefix distinction.
 */
export function getReadClientForPlatformFile(file: { storageProviderId?: string | null; url?: string | null; access?: string | null }): StorageClient {
  // Public files live in PUBLIC_BUCKET at root prefix.
  const isPublicBucketFile =
    file.access === "public" ||
    (!!file.url &&
      (file.url.includes(`${PUBLIC_BUCKET}.${PUBLIC_ASSET_HOST}`) ||
        file.url.includes(`${PUBLIC_BUCKET}.fly.storage.tigris.dev`)));
  if (isPublicBucketFile) {
    return getPlatformDefaultClient({ bucket: PUBLIC_BUCKET, prefix: "" });
  }
  // Private files live in PRIVATE_BUCKET. Legacy + MCP uploads use the `mcp/`
  // prefix; anything else lives at root.
  const isMcpFile = !file.url || file.url.includes("/mcp/");
  return getPlatformDefaultClient({ prefix: isMcpFile ? "mcp/" : "" });
}

/**
 * Client for writing PUBLIC platform assets (PDFs, screenshots, OG images,
 * deployed website files). Bucket policy on PUBLIC_BUCKET only exposes the
 * root prefix — anything under `mcp/` returns 403 even though the bucket name
 * says "public". Always use this helper for assets meant to be embedded in
 * HTML or fetched directly by browsers.
 */
export function getPlatformPublicClient(): StorageClient {
  return getPlatformDefaultClient({ bucket: PUBLIC_BUCKET, prefix: "" });
}

/**
 * Build the canonical browser-fetchable URL for an object stored via
 * `getPlatformPublicClient`. Do NOT prepend `mcp/` — that path is unreadable
 * publicly. Pair this with `getPlatformPublicClient().putObject(key, ...)`.
 */
export function buildPublicAssetUrl(storageKey: string): string {
  return `https://${PUBLIC_BUCKET}.${PUBLIC_ASSET_HOST}/${storageKey}`;
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

// --- Cross-bucket operations (platform S3 only) ---

function getPlatformS3(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  if (!endpoint) throw new Error("Platform storage not configured");
  return new S3Client({
    region: process.env.AWS_REGION || "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
}

// Tigris Acceleration Gateway endpoint. Deleting an object through this endpoint
// eagerly purges the edge cache (TAG drops the cache entry before forwarding the
// DELETE). The direct endpoint (AWS_ENDPOINT_URL_S3 = t3.storage.dev) does NOT —
// a deleted public object keeps serving a stale 200 from
// `*.fly.storage.tigris.dev` until the cache TTL ages it out.
const TIGRIS_GATEWAY_ENDPOINT =
  process.env.TIGRIS_GATEWAY_ENDPOINT || "https://fly.storage.tigris.dev";

function getPlatformGatewayS3(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || "auto",
    endpoint: TIGRIS_GATEWAY_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
}

export async function copyObjectAcrossBuckets(opts: {
  fromBucket: string;
  toBucket: string;
  key: string;
  destKey?: string;
}) {
  const s3 = getPlatformS3();
  await s3.send(
    new CopyObjectCommand({
      Bucket: opts.toBucket,
      Key: opts.destKey || opts.key,
      CopySource: `/${opts.fromBucket}/${opts.key}`,
    })
  );
}

export async function deleteObjectFromBucket(opts: {
  bucket: string;
  key: string;
}) {
  // Route PUBLIC bucket deletes through the Tigris gateway so the edge cache is
  // purged immediately; everything else uses the direct endpoint.
  const s3 =
    opts.bucket === PUBLIC_BUCKET ? getPlatformGatewayS3() : getPlatformS3();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
    })
  );
}
