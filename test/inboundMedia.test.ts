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
  summarizeUnhandled,
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

// El envelope del canal de Formmy (location/contacts/quoted/reaction/unhandled) venía
// descartándose en la superficie WABA: una ubicación compartida para una entrega se perdía
// entera y una campaña llegaba como "📎 [system]" sin nada más. Ver wabaExtraLines.
describe("extractWabaContent — extras del envelope WABA", () => {
  const opts = { ownerId: "owner-1" };

  it("ubicación sola: link de maps, coordenadas y cuenta como media", async () => {
    const res = await extractWabaContent("", null, {
      ...opts,
      extras: { location: { latitude: 19.4326, longitude: -99.1332, name: "Casa", address: "Centro" } },
    });
    expect(res.text).toContain("[Ubicación: 19.4326,-99.1332]");
    expect(res.text).toContain("https://maps.google.com/?q=19.4326,-99.1332");
    expect(res.text).toContain('"Casa"');
    expect(res.hasMedia).toBe(true);
    expect(res.userText).toContain("Ubicación"); // el Inbox no queda vacío
  });

  it("la línea del extra va ANTES del texto del usuario, sin pisarlo", async () => {
    const res = await extractWabaContent("aquí es", null, {
      ...opts,
      extras: { location: { latitude: 1, longitude: 2 } },
    });
    expect(res.text).toBe("[Ubicación: 1,2] https://maps.google.com/?q=1,2\naquí es");
    expect(res.userText).toBe("aquí es"); // el texto propio del usuario no se contamina
  });

  it("contactos: usa phones, y cae al vcard cuando no vienen", async () => {
    const res = await extractWabaContent("", null, {
      ...opts,
      extras: {
        contacts: [
          { name: "Ana", phones: ["+52 771 123 4567"] },
          { name: "Beto", vcard_raw: "BEGIN:VCARD\nTEL;type=CELL:+52 55 9999 0000\nEND:VCARD" },
        ],
      },
    });
    expect(res.text).toContain("[Contacto: Ana, tel: +52 771 123 4567]");
    expect(res.text).toContain("[Contacto: Beto, tel: +52 55 9999 0000]");
  });

  it("quoted: con preview lo cita, sin preview deja la marca genérica", async () => {
    const conPreview = await extractWabaContent("sí", null, {
      ...opts,
      extras: { quoted: { message_id: "wamid.x", content_preview: "Tu cotización 260726-010" } },
    });
    expect(conPreview.text).toContain('[Responde a: "Tu cotización 260726-010"]');
    const sinPreview = await extractWabaContent("sí", null, {
      ...opts,
      extras: { quoted: { message_id: "wamid.x" } },
    });
    expect(sinPreview.text).toContain("[Responde a un mensaje anterior]");
  });

  it("unhandled: nombra el tipo en vez del placeholder opaco", async () => {
    const res = await extractWabaContent("", null, {
      ...opts,
      extras: { unhandled: { meta_type: "system", raw: { type: "system", system: { type: "user_changed_number" } } } },
    });
    expect(res.text).toContain('tipo "system"');
    expect(res.text).toContain("user_changed_number");
    expect(res.text).not.toContain("📎");
  });

  it("sin extras la salida es idéntica a antes (no-regresión)", async () => {
    const conObjetoVacio = await extractWabaContent("hola", null, { ...opts, extras: {} });
    const sinCampo = await extractWabaContent("hola", null, opts);
    expect(conObjetoVacio.text).toBe("hola");
    expect(sinCampo.text).toBe("hola");
    expect(sinCampo.hasMedia).toBe(false);
  });
});

describe("summarizeUnhandled — allowlist, nunca datos personales", () => {
  it("saca la campaña y NO el teléfono del cliente", () => {
    const s = summarizeUnhandled({
      type: "system",
      system: { type: "user_changed_number", wa_id: "5215512345678", customer: "5215512345678" },
      referral: { source_type: "ad", source_id: "camp-42", headline: "Promo esencias", ctwa_clid: "clid-abc" },
    });
    const dump = JSON.stringify(s);
    expect((s.referral as any).source_type).toBe("ad");
    expect((s.referral as any).ctwa_clid).toBe("clid-abc");
    expect(s.systemType).toBe("user_changed_number");
    expect(dump).not.toContain("5215512345678"); // ni wa_id ni customer
    expect(s.rawKeys).toEqual(["type", "system", "referral"]); // deja ver qué llegó
  });
});
