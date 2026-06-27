// Outbound file delivery for the FleetAgent's Baileys edge.
//
// The worker brain is text-only over SSE, so when it wants to send a file it
// uploads to EasyBits (export_document / upload_file / get_file) and drops the
// resulting URL into its reply text. This scans the reply for those URLs,
// downloads each, and sends it into the chat as a real ATTACHMENT (not a link),
// stripping the URL from the text. Ported verbatim from ghosty-gc's
// maybeDeliverFiles (server.js) — same SSRF guard, content-type allowlist and
// 25MB cap — with one upgrade: images go inline as { image } instead of as a
// document.
type SendFn = (jid: string, content: Record<string, unknown>) => Promise<unknown>;

export async function deliverFilesFromReply(
  send: SendFn,
  jid: string,
  text: string
): Promise<{ text: string; sent: number }> {
  const urls = (text.match(/https?:\/\/[^\s)>\]"']+/g) || []).slice(0, 3);
  let out = text;
  let sent = 0;
  for (const url of urls) {
    // SSRF guard: never fetch local/private hosts.
    if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url)) continue;
    try {
      const resp = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) continue;
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      // Only real file content-types — a normal webpage (text/html) is left as a link.
      if (!/(application\/pdf|octet-stream|zip|image\/|spreadsheet|wordprocessing|presentation|vnd\.)/.test(ct)) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf.length || buf.length > 25 * 1024 * 1024) continue;
      let fileName = decodeURIComponent(url.split("?")[0].split("/").pop() || "archivo") || "archivo";
      const isPdf = /pdf/.test(ct);
      const isImage = /^image\//.test(ct);
      if (isPdf && !/\.\w+$/.test(fileName)) fileName += ".pdf";
      const mime = isPdf ? "application/pdf" : ct.split(";")[0] || "application/octet-stream";
      if (isImage) await send(jid, { image: buf });
      else await send(jid, { document: buf, mimetype: mime, fileName });
      out = out.split(url).join("").trim();
      sent++;
    } catch {
      // best-effort: a failed delivery just leaves the URL in the text
    }
  }
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), sent };
}
