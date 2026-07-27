import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression suite for the silent no-op delete: public-bucket DELETEs used to be
// routed through the retired Tigris Acceleration Gateway (`fly.storage.tigris.dev`),
// which 403s everything. The delete failed, callers swallowed it, and the object
// kept serving while the DB claimed it was private/deleted.

// vi.hoisted: these are referenced from vi.mock factories, which are hoisted above
// the module body.
const { sendMock, s3ClientCtor, warnMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  s3ClientCtor: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation((cfg: unknown) => {
    s3ClientCtor(cfg);
    return { send: sendMock };
  }),
  DeleteObjectCommand: vi.fn((input) => ({ __type: "Delete", input })),
  HeadObjectCommand: vi.fn((input) => ({ __type: "Head", input })),
  CopyObjectCommand: vi.fn((input) => ({ __type: "Copy", input })),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
  PutBucketCorsCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  CreateMultipartUploadCommand: vi.fn(),
  UploadPartCommand: vi.fn(),
  CompleteMultipartUploadCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));
vi.mock("~/.server/db", () => ({ db: {} }));

vi.mock("~/.server/logger", () => ({ default: { warn: warnMock, error: vi.fn(), info: vi.fn() } }));

import {
  deleteObjectFromBucket,
  ObjectStillExistsError,
  PUBLIC_BUCKET,
  PRIVATE_BUCKET,
} from "~/.server/storage";

const notFound = Object.assign(new Error("Not Found"), {
  name: "NotFound",
  $metadata: { httpStatusCode: 404 },
});

/** Delete resolves; HEAD behavior is what each test controls. */
function mockDeleteThen(headResult: "gone" | "alive" | Error) {
  sendMock.mockImplementation(async (cmd: { __type: string }) => {
    if (cmd.__type === "Delete") return {};
    if (headResult === "gone") throw notFound;
    if (headResult === "alive") return { ContentLength: 123 };
    throw headResult;
  });
}

const commandTypes = () => sendMock.mock.calls.map(([c]) => c.__type);

describe("deleteObjectFromBucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://t3.storage.dev");
    vi.stubEnv("AWS_REGION", "auto");
  });

  it("deletes and verifies a public object", async () => {
    mockDeleteThen("gone");
    await expect(
      deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: "owner/abc.pdf" })
    ).resolves.toBeUndefined();
    expect(commandTypes()).toEqual(["Delete", "Head"]);
    expect(sendMock.mock.calls[0][0].input).toEqual({ Bucket: PUBLIC_BUCKET, Key: "owner/abc.pdf" });
  });

  // THE bug: the delete "succeeded" but the object is still there.
  it("throws when the public object survives the delete", async () => {
    mockDeleteThen("alive");
    await expect(
      deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: "owner/leak.pdf" })
    ).rejects.toBeInstanceOf(ObjectStillExistsError);
  });

  it("carries the bucket and key on the error", async () => {
    mockDeleteThen("alive");
    const err: ObjectStillExistsError = await deleteObjectFromBucket({
      bucket: PUBLIC_BUCKET,
      key: "owner/leak.pdf",
    }).then(
      () => {
        throw new Error("expected it to throw");
      },
      (e) => e
    );
    expect(err.bucket).toBe(PUBLIC_BUCKET);
    expect(err.key).toBe("owner/leak.pdf");
    expect(err.message).toContain("owner/leak.pdf");
  });

  it("is idempotent when the key does not exist", async () => {
    sendMock.mockImplementation(async (cmd: { __type: string }) => {
      throw notFound; // both DELETE and HEAD report missing
    });
    await expect(
      deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: "owner/ghost.pdf" })
    ).resolves.toBeUndefined();
  });

  it("skips verification for the private bucket", async () => {
    mockDeleteThen("gone");
    await deleteObjectFromBucket({ bucket: PRIVATE_BUCKET, key: "mcp/owner/abc.pdf" });
    expect(commandTypes()).toEqual(["Delete"]);
  });

  it("verifies the private bucket when asked explicitly", async () => {
    mockDeleteThen("gone");
    await deleteObjectFromBucket({ bucket: PRIVATE_BUCKET, key: "mcp/owner/abc.pdf", verify: true });
    expect(commandTypes()).toEqual(["Delete", "Head"]);
  });

  // Regression guard: any endpoint other than the direct one silently loses deletes.
  it("uses the direct S3 endpoint, never the retired gateway", async () => {
    mockDeleteThen("gone");
    await deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: "owner/abc.pdf" });
    const cfg = s3ClientCtor.mock.calls.at(-1)?.[0] as { endpoint?: string };
    expect(cfg.endpoint).toBe("https://t3.storage.dev");
    expect(cfg.endpoint).not.toContain("fly.storage.tigris.dev");
  });

  // A HEAD that fails for its own reasons doesn't prove the object survived —
  // warn, don't break the caller's flow.
  it("warns but does not throw when verification itself fails", async () => {
    mockDeleteThen(Object.assign(new Error("Forbidden"), { $metadata: { httpStatusCode: 403 } }));
    await expect(
      deleteObjectFromBucket({ bucket: PUBLIC_BUCKET, key: "owner/abc.pdf" })
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});
