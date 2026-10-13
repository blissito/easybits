import { describe, it, expect, vi, beforeEach } from "vitest";

// Archivos que respaldan un sitio (`sites/<websiteId>/…`): list_files no los
// enseña y delete_file/bulk_delete_files se niegan a borrarlos mientras el
// sitio siga vivo. Antes un agente los veía en la lista, los borraba y tumbaba
// el sitio publicado.

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    file: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    website: { findMany: vi.fn() },
    workspace: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("~/.server/db", () => ({ db: dbMock }));
vi.mock("~/.server/storage", () => ({
  ObjectStillExistsError: class extends Error {},
  PUBLIC_BUCKET: "easybits-public",
  PRIVATE_BUCKET: "easybits-dev",
  deleteObjectFromBucket: vi.fn(),
  copyObjectAcrossBuckets: vi.fn(),
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

import { listFiles, deleteFile, bulkDeleteFiles } from "~/.server/core/operations";

const ctx = { user: { id: "u1" }, scopes: ["READ", "WRITE", "DELETE", "ADMIN"] } as never;
const SITE = "65f0c0ffee0000000000abcd";

const siteFile = {
  id: "f-site", ownerId: "u1", name: `sites/${SITE}/index.html`, size: 10,
  storageKey: "u1/x", storageProviderId: null, access: "private", url: "", workspaceId: null, status: "DONE",
};
const plainFile = { ...siteFile, id: "f-plain", name: "foto.png" };

async function errorOf(p: Promise<unknown>) {
  try { await p; } catch (e) {
    if (e instanceof Response) return { status: e.status, body: await e.json() };
    throw e;
  }
  throw new Error("expected rejection");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.website.findMany.mockResolvedValue([{ id: SITE, slug: "mi-sitio", deletedAt: null }]);
});

describe("listFiles", () => {
  it("excluye los archivos de sitios por default", async () => {
    dbMock.file.findMany.mockResolvedValue([]);
    await listFiles(ctx, {});
    const { where } = dbMock.file.findMany.mock.calls[0][0];
    expect(where.NOT).toEqual({ name: { startsWith: "sites/" } });
  });

  it("los incluye sólo con includeWebsiteFiles explícito", async () => {
    dbMock.file.findMany.mockResolvedValue([]);
    await listFiles(ctx, { includeWebsiteFiles: true });
    expect(dbMock.file.findMany.mock.calls[0][0].where.NOT).toBeUndefined();
  });
});

describe("deleteFile", () => {
  it("se niega con 409 WEBSITE_FILE si el archivo respalda un sitio vivo", async () => {
    dbMock.file.findUnique.mockResolvedValue(siteFile);
    const err = await errorOf(deleteFile(ctx, "f-site"));
    expect(err.status).toBe(409);
    expect(err.body.code).toBe("WEBSITE_FILE");
    expect(err.body.error).toMatch(/list_website_files/);
    expect(err.body.error).toMatch(/\/s\/mi-sitio\//);
    expect(dbMock.file.update).not.toHaveBeenCalled();
  });

  it("borra si el sitio ya no existe (archivo huérfano)", async () => {
    dbMock.file.findUnique.mockResolvedValue(siteFile);
    dbMock.website.findMany.mockResolvedValue([]);
    await expect(deleteFile(ctx, "f-site")).resolves.toEqual({ success: true });
    expect(dbMock.file.update).toHaveBeenCalled();
  });

  it("borra un archivo normal sin consultar sitios", async () => {
    dbMock.file.findUnique.mockResolvedValue(plainFile);
    await expect(deleteFile(ctx, "f-plain")).resolves.toEqual({ success: true });
    expect(dbMock.website.findMany).not.toHaveBeenCalled();
  });
});

describe("bulkDeleteFiles", () => {
  it("todo o nada: si uno respalda un sitio vivo no borra ninguno", async () => {
    dbMock.file.findMany.mockResolvedValue([plainFile, siteFile]);
    const err = await errorOf(bulkDeleteFiles(ctx, ["f-plain", "f-site"]));
    expect(err.status).toBe(409);
    expect(err.body.fileIds).toEqual(["f-site"]);
    expect(dbMock.file.updateMany).not.toHaveBeenCalled();
  });

  it("borra los archivos normales", async () => {
    dbMock.file.findMany.mockResolvedValue([plainFile]);
    await expect(bulkDeleteFiles(ctx, ["f-plain"])).resolves.toEqual({ deleted: 1, ids: ["f-plain"] });
  });
});
