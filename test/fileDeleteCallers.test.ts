import { describe, it, expect, vi, beforeEach } from "vitest";

// The callers' half of the silent-delete bug: they used to swallow storage
// failures, so the DB flipped to "deleted"/"private" while the object stayed
// live and public. Now a proven-alive object must stop the DB write.

const { storage, dbMock, ObjectStillExistsError } = vi.hoisted(() => {
  class ObjectStillExistsError extends Error {
    constructor(readonly bucket: string, readonly key: string) {
      super(`Object still exists after delete: ${bucket}/${key}`);
      this.name = "ObjectStillExistsError";
    }
  }
  return {
    ObjectStillExistsError,
    storage: {
      deleteObjectFromBucket: vi.fn(),
      copyObjectAcrossBuckets: vi.fn().mockResolvedValue(undefined),
    },
    dbMock: {
      file: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
      },
      shareToken: { deleteMany: vi.fn().mockResolvedValue({}) },
      permission: { deleteMany: vi.fn().mockResolvedValue({}) },
      videoGeneration: { updateMany: vi.fn().mockResolvedValue({}) },
      presentationStyle: { updateMany: vi.fn().mockResolvedValue({}) },
      mcpStructuredDoc: { updateMany: vi.fn().mockResolvedValue({}) },
      character: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      asset: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    },
  };
});

vi.mock("~/.server/db", () => ({ db: dbMock }));
vi.mock("~/.server/storage", () => ({
  ...storage,
  ObjectStillExistsError,
  PUBLIC_BUCKET: "easybits-public",
  PRIVATE_BUCKET: "easybits-dev",
  getClientForFile: vi.fn(),
  getReadClientForPlatformFile: vi.fn(() => ({ deleteObject: vi.fn() })),
  resolveProvider: vi.fn(),
  createStorageClient: vi.fn(),
  getPlatformDefaultClient: vi.fn(),
  getPlatformPublicClient: vi.fn(),
  buildPublicAssetUrl: vi.fn((k: string) => `https://easybits-public.t3.storage.dev/${k}`),
}));
vi.mock("~/.server/logger", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("~/.server/webhooks", () => ({ dispatchWebhooks: vi.fn() }));
vi.mock("~/.server/core/notificationOperations", () => ({ notifyFilesPurged: vi.fn() }));
vi.mock("~/lib/fly_certs/certs_getters", () => ({ createHost: vi.fn(), removeHost: vi.fn() }));

import { deleteFile, purgeDeletedFiles, findFileByStorageKey } from "~/.server/core/operations";

const ctx = { user: { id: "u1" }, scopes: ["READ", "WRITE", "DELETE", "ADMIN"] } as never;

const publicFile = {
  id: "f1",
  ownerId: "u1",
  name: "cotizacion.pdf",
  size: 100,
  storageKey: "u1/abc.pdf",
  storageProviderId: null,
  access: "public",
  url: "https://easybits-public.t3.storage.dev/u1/abc.pdf",
  workspaceId: null,
  status: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
  storage.copyObjectAcrossBuckets.mockResolvedValue(undefined);
});

describe("deleteFile", () => {
  it("does NOT mark the file deleted when the public object survives", async () => {
    dbMock.file.findUnique.mockResolvedValue(publicFile);
    storage.deleteObjectFromBucket.mockRejectedValue(
      new ObjectStillExistsError("easybits-public", "u1/abc.pdf")
    );

    const res = await deleteFile(ctx, "f1").catch((e) => e);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(500);
    // The row keeps saying "public" — no lying to the user.
    expect(dbMock.file.update).not.toHaveBeenCalled();
  });

  it("marks it deleted once the object is really gone", async () => {
    dbMock.file.findUnique.mockResolvedValue(publicFile);
    storage.deleteObjectFromBucket.mockResolvedValue(undefined);

    await expect(deleteFile(ctx, "f1")).resolves.toEqual({ success: true });
    // depublish flips it to private, then the soft-delete lands.
    expect(dbMock.file.update).toHaveBeenCalledTimes(2);
    expect(dbMock.file.update.mock.calls[0][0].data).toEqual({ access: "private", url: "" });
    expect(dbMock.file.update.mock.calls[1][0].data.status).toBe("DELETED");
  });
});

describe("purgeDeletedFiles", () => {
  it("keeps the row of a file whose public object survived, and purges the rest", async () => {
    dbMock.file.updateMany.mockResolvedValue({ count: 0 });
    dbMock.file.findMany.mockResolvedValue([
      { ...publicFile, id: "a", storageKey: "u1/a.pdf" },
      { ...publicFile, id: "b", storageKey: "u1/b.pdf" },
      { ...publicFile, id: "c", storageKey: "u1/c.pdf" },
    ]);
    storage.deleteObjectFromBucket.mockImplementation(async ({ key }: { key: string }) => {
      if (key === "u1/b.pdf") throw new ObjectStillExistsError("easybits-public", key);
    });

    const result = await purgeDeletedFiles();

    expect(result).toEqual({ purged: 2, eligible: 3, sealed: 0 });
    // The survivor keeps its DB row so it stays auditable and retryable.
    const deletedIds = dbMock.file.delete.mock.calls.map(([arg]) => arg.where.id);
    expect(deletedIds).toEqual(["a", "c"]);
  });

  // Mongo does not match an ABSENT field with `{ lt: cutoff }`, so legacy rows
  // (soft-deleted before the deletedAt field existed) never entered the sweep.
  it("stamps deletedAt on legacy rows that have none, without purging them in the same run", async () => {
    dbMock.file.updateMany.mockResolvedValue({ count: 3 });
    dbMock.file.findMany.mockResolvedValue([]);

    const result = await purgeDeletedFiles();

    expect(result).toEqual({ purged: 0, eligible: 0, sealed: 3 });
    const [sealArg] = dbMock.file.updateMany.mock.calls[0];
    expect(sealArg.where.status).toBe("DELETED");
    expect(sealArg.where.OR).toEqual([
      { deletedAt: null },
      { deletedAt: { isSet: false } },
    ]);
    expect(sealArg.data.deletedAt).toBeInstanceOf(Date);
    // Sealed rows keep their 7-day window: nothing is hard-deleted this run.
    expect(dbMock.file.delete).not.toHaveBeenCalled();
  });
});

describe("findFileByStorageKey", () => {
  const own = {
    id: "f1",
    name: "CATALOGO.pdf",
    size: 9_000_000,
    contentType: "application/pdf",
    access: "public",
    url: "https://easybits-public.t3.storage.dev/u1/abc-CATALOGO.pdf",
    storageKey: "u1/abc-CATALOGO.pdf",
    status: "DONE",
    ownerId: "u1",
    workspaceId: null,
  };

  it("resolves a public URL back to the owner's file", async () => {
    dbMock.file.findUnique.mockResolvedValue(own);

    const found = await findFileByStorageKey(ctx, own.url);

    expect(dbMock.file.findUnique).toHaveBeenCalledWith({
      where: { storageKey: "u1/abc-CATALOGO.pdf" },
    });
    expect(found?.id).toBe("f1");
  });

  it("accepts a bare storage key too", async () => {
    dbMock.file.findUnique.mockResolvedValue(own);
    expect((await findFileByStorageKey(ctx, "u1/abc-CATALOGO.pdf"))?.id).toBe("f1");
  });

  it("returns null for another account's file, a deleted one, or garbage", async () => {
    dbMock.file.findUnique.mockResolvedValue({ ...own, ownerId: "u2" });
    expect(await findFileByStorageKey(ctx, own.url)).toBeNull();

    dbMock.file.findUnique.mockResolvedValue({ ...own, status: "DELETED" });
    expect(await findFileByStorageKey(ctx, own.url)).toBeNull();

    dbMock.file.findUnique.mockResolvedValue(null);
    expect(await findFileByStorageKey(ctx, "https://ajeno.example/x.pdf")).toBeNull();
    expect(await findFileByStorageKey(ctx, "   ")).toBeNull();
  });
});
