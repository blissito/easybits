import { describe, it, expect, vi, beforeEach } from "vitest";

// El borde Baileys descarga media cifrada de WhatsApp cuyo enlace puede caducar
// (403). Mockeamos downloadMediaMessage para que SIEMPRE falle y verificamos que
// el mensaje NO se descarta en silencio: el agente debe recibir una nota que
// nombre el archivo y pida reenvío (no quedarse mudo).
vi.mock("@whiskeysockets/baileys", () => ({
  downloadMediaMessage: vi.fn(() => Promise.reject(new Error("403 Forbidden"))),
  normalizeMessageContent: (m: any) => m,
  getContentType: (c: any) => Object.keys(c || {})[0],
}));

vi.mock("~/.server/storage", () => ({
  getPlatformDefaultClient: () => ({
    putObject: vi.fn(() => Promise.resolve()),
    getReadUrl: vi.fn(() => Promise.resolve("https://signed.example/x")),
  }),
}));

vi.mock("~/.server/services/providers/describe", () => ({
  describeImageService: {
    execute: vi.fn(() => Promise.resolve({ data: { description: "desc" } })),
  },
}));

vi.mock("~/.server/core/fleetVoice", () => ({
  transcribeAudio: vi.fn(() => Promise.resolve("")),
}));

import { downloadMediaMessage } from "@whiskeysockets/baileys";
import {
  extractInboundContent,
  extractWabaContent,
} from "~/.server/integrations/whatsapp/inboundMedia.server";

const sock: any = { updateMediaMessage: vi.fn() };
const opts = { ownerId: "owner-1" };

function msg(message: any): any {
  return {
    key: { remoteJid: "g@g.us", id: "m1", participant: "p@s.whatsapp.net", fromMe: false },
    message,
  };
}

beforeEach(() => {
  vi.mocked(downloadMediaMessage).mockClear();
});

describe("extractInboundContent — failed media download is never silently dropped", () => {
  it("document-only with a failed download → names the file and asks for a resend", async () => {
    const res = await extractInboundContent(
      sock,
      msg({ documentMessage: { fileName: "report.pdf", mimetype: "application/pdf" } }),
      opts,
    );
    expect(res).not.toBeNull();
    expect(res!.text).toContain("report.pdf");
    expect(res!.text).toMatch(/reenv|caduc/i);
    expect(res!.hasMedia).toBe(true);
  });

  it("document WITH caption + failed download → keeps the caption AND the failure note", async () => {
    const res = await extractInboundContent(
      sock,
      msg({ documentMessage: { fileName: "report.pdf", mimetype: "application/pdf", caption: "mira esto" } }),
      opts,
    );
    expect(res).not.toBeNull();
    expect(res!.text).toContain("mira esto");
    expect(res!.text).toContain("report.pdf");
    expect(res!.text).toMatch(/reenv|caduc/i);
  });

  it("reply to a document whose re-download fails → quoted frame is not lost", async () => {
    const res = await extractInboundContent(
      sock,
      msg({
        extendedTextMessage: {
          text: "resume esto",
          contextInfo: {
            stanzaId: "qid",
            participant: "p@s.whatsapp.net",
            quotedMessage: { documentMessage: { fileName: "quoted.pdf" } },
          },
        },
      }),
      opts,
    );
    expect(res).not.toBeNull();
    expect(res!.text).toContain("resume esto");
    expect(res!.text).toContain("quoted.pdf");
    expect(res!.text).toMatch(/reenv|recuper/i);
  });

  it("reply to a voice note whose re-download fails → quoted frame is not lost", async () => {
    const res = await extractInboundContent(
      sock,
      msg({
        extendedTextMessage: {
          text: "escucha esto",
          contextInfo: {
            stanzaId: "qid",
            participant: "p@s.whatsapp.net",
            quotedMessage: { audioMessage: { mimetype: "audio/ogg" } },
          },
        },
      }),
      opts,
    );
    expect(res).not.toBeNull();
    expect(res!.text).toContain("escucha esto");
    expect(res!.text).toMatch(/nota de voz/i);
    expect(res!.text).toMatch(/reenv|recuper/i);
  });

  it("passes reuploadRequest as the 4th arg so expired media gets re-fetched", async () => {
    await extractInboundContent(
      sock,
      msg({ documentMessage: { fileName: "report.pdf", mimetype: "application/pdf" } }),
      opts,
    );
    const ctx = vi.mocked(downloadMediaMessage).mock.calls.at(-1)?.[3] as any;
    expect(typeof ctx?.reuploadRequest).toBe("function");
  });
});

describe("extractWabaContent — failed media fetch names the file", () => {
  it("document fetch failure → fallback note names the file", async () => {
    const res = await extractWabaContent(
      "",
      // 127.0.0.1:1 → ECONNREFUSED fast, so fetchMedia throws synchronously-ish.
      { type: "document", url: "http://127.0.0.1:1/x", fileName: "waba.pdf", mimeType: "application/pdf" },
      { ownerId: "owner-1" },
    );
    expect(res.text).toContain("waba.pdf");
    expect(res.text).toMatch(/reenv|describ|procesar/i);
    expect(res.hasMedia).toBe(true);
  });
});
