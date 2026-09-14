import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";

const put = vi.fn(async () => {});
vi.mock("../app/.server/storage", () => ({
  getPlatformDefaultClient: () => ({
    putObject: put,
    getReadUrl: async () => "https://signed.example/x",
  }),
}));

import { offloadOversizedRead } from "../app/.server/mcp/offloadOversizedRead";

const ctx = { user: { id: "u1" } } as any;

describe("sandbox_files_read sin encoding (base64 + autodetección)", () => {
  it("texto UTF-8 válido vuelve inline como utf8", async () => {
    const text = "hola ñandú\n";
    const res = await offloadOversizedRead(
      ctx,
      { content: Buffer.from(text).toString("base64"), size: text.length, encoding: "base64" },
      "/app/a.txt",
      { autoDetect: true }
    );
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed).toEqual({ content: text, size: text.length, encoding: "utf8" });
  });

  it("binario sube los bytes tal cual (sha256 del original, sin U+FFFD)", async () => {
    // header mp4 con bytes altos: antes salían como EF BF BD
    const raw = Buffer.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0xff, 0xfe, 0x80, 0x00, 0xc3]);
    const big = Buffer.concat([raw, Buffer.alloc(60 * 1024, 0x91)]);
    put.mockClear();
    const res = await offloadOversizedRead(
      ctx,
      { content: big.toString("base64"), size: big.length, encoding: "base64" },
      "/app/clip.mp4",
      { autoDetect: true }
    );
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.size_bytes).toBe(big.length);
    expect(parsed.sha256).toBe(createHash("sha256").update(big).digest("hex"));
    expect(parsed.mime).toBe("video/mp4");
    expect(Buffer.compare(put.mock.calls[0][1] as Buffer, big)).toBe(0);
  });
});
