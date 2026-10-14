import { describe, it, expect } from "vitest";
import { uploadFile } from "../app/.server/core/operations";

const ctx = (pattern: string | null) =>
  ({ user: { id: "u1" }, scopes: ["WRITE"], apiKey: { id: "k1", blockUploadPattern: pattern } }) as any;

describe("ApiKey.blockUploadPattern", () => {
  it("una foto de WhatsApp de nanoclaw se rechaza con 403 (nanoclaw cae solo a base64)", async () => {
    const r = await uploadFile(ctx("^img-\\d+-[a-z0-9]{4}\\.jpg$"), { fileName: "img-1791848043128-sz8q.jpg", contentType: "image/jpeg", size: 1000 }).catch((e) => e);
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });
  it("otros nombres con la misma llave no se tocan (no llega al veto)", async () => {
    const r = await uploadFile(ctx("^img-\\d+-[a-z0-9]{4}\\.jpg$"), { fileName: "reporte.pdf", contentType: "application/pdf", size: 0 }).catch((e) => e);
    // size 0 → 400 de validación: pasó el veto sin 403.
    expect((r as Response).status).toBe(400);
  });
});
