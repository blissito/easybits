import { describe, it, expect, vi } from "vitest";
import { getDefaultClient } from "~/.server/storage";

// Mock AWS SDK
vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({ UploadId: "test-upload-id" });
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send })),
    GetObjectCommand: vi.fn(),
    PutObjectCommand: vi.fn(),
    PutBucketCorsCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    CreateMultipartUploadCommand: vi.fn(),
    UploadPartCommand: vi.fn(),
    CompleteMultipartUploadCommand: vi.fn(),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed-url.example.com"),
}));

describe("storage", () => {
  it("getDefaultClient returns a StorageClient", () => {
    const client = getDefaultClient();
    expect(client).toBeDefined();
    expect(client.getPutUrl).toBeInstanceOf(Function);
    expect(client.getReadUrl).toBeInstanceOf(Function);
    expect(client.deleteObject).toBeInstanceOf(Function);
    expect(client.createMultipart).toBeInstanceOf(Function);
    expect(client.getPutPartUrl).toBeInstanceOf(Function);
    expect(client.completeMultipart).toBeInstanceOf(Function);
  });

  it("getPutUrl returns a signed URL", async () => {
    const client = getDefaultClient();
    const url = await client.getPutUrl("test-key");
    expect(url).toBe("https://signed-url.example.com");
  });

  it("getReadUrl returns a signed URL", async () => {
    const client = getDefaultClient();
    const url = await client.getReadUrl("test-key");
    expect(url).toBe("https://signed-url.example.com");
  });

  it("createMultipart returns uploadId", async () => {
    const client = getDefaultClient();
    const result = await client.createMultipart("test-key");
    expect(result.uploadId).toBe("test-upload-id");
  });
});
