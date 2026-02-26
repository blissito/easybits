import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock purgeDeletedFiles before importing the loader
const mockPurgeDeletedFiles = vi.fn();
vi.mock("~/.server/core/operations", () => ({
  purgeDeletedFiles: mockPurgeDeletedFiles,
}));

// Dynamic import so mocks are in place
const { loader } = await import("~/routes/api/cron/purge-files");

function makeRequest(options: { secret?: string; useHeader?: boolean } = {}) {
  const url = options.secret && !options.useHeader
    ? `http://localhost/api/cron/purge-files?secret=${options.secret}`
    : "http://localhost/api/cron/purge-files";

  const headers = new Headers();
  if (options.secret && options.useHeader) {
    headers.set("Authorization", `Bearer ${options.secret}`);
  }

  return new Request(url, { headers });
}

describe("purge-files cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-secret");
  });

  it("returns 401 without secret", async () => {
    const request = makeRequest();
    try {
      await loader({ request, params: {}, context: {} } as any);
      expect.unreachable();
    } catch (e: any) {
      // data() throws a Response-like object; check init.status or status
      const status = e.status ?? e.init?.status;
      expect(status).toBe(401);
    }
  });

  it("returns 401 with wrong secret", async () => {
    const request = makeRequest({ secret: "wrong", useHeader: true });
    try {
      await loader({ request, params: {}, context: {} } as any);
      expect.unreachable();
    } catch (e: any) {
      const status = e.status ?? e.init?.status;
      expect(status).toBe(401);
    }
  });

  it("returns 401 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const request = makeRequest({ secret: "anything", useHeader: true });
    try {
      await loader({ request, params: {}, context: {} } as any);
      expect.unreachable();
    } catch (e: any) {
      const status = e.status ?? e.init?.status;
      expect(status).toBe(401);
    }
  });

  it("purges files with valid Bearer header", async () => {
    mockPurgeDeletedFiles.mockResolvedValue({ purged: 3 });
    const request = makeRequest({ secret: "test-secret", useHeader: true });
    const result = await loader({ request, params: {}, context: {} } as any);
    expect(mockPurgeDeletedFiles).toHaveBeenCalledOnce();
    expect((result as any).data).toEqual({ purged: 3 });
  });

  it("purges files with valid query string (backward compat)", async () => {
    mockPurgeDeletedFiles.mockResolvedValue({ purged: 0 });
    const request = makeRequest({ secret: "test-secret", useHeader: false });
    const result = await loader({ request, params: {}, context: {} } as any);
    expect(mockPurgeDeletedFiles).toHaveBeenCalledOnce();
    expect((result as any).data).toEqual({ purged: 0 });
  });
});
