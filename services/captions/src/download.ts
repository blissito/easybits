import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";

export async function downloadToTmp(
  url: string,
  workDir: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) {
    throw new Error(`download failed ${res.status}: ${url}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  const ext = guessExt(url, ct);
  const out = join(workDir, `input${ext}`);
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(res.body as any)
      .pipe(createWriteStream(out))
      .on("finish", () => resolve())
      .on("error", reject);
  });
  return out;
}

function guessExt(url: string, contentType: string): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  if (m) return `.${m[1].toLowerCase()}`;
  if (contentType.includes("quicktime")) return ".mov";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("matroska")) return ".mkv";
  if (contentType.includes("webm")) return ".webm";
  return ".bin";
}
