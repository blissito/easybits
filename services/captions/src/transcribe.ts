import { execSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { basename, extname, join } from "node:path";
import Groq from "groq-sdk";

export type WhisperWord = { word: string; start: number; end: number };
export type TranscriptionResult = {
  text: string;
  words: WhisperWord[];
  duration: number;
};

export async function transcribe(
  videoPath: string,
  workDir: string,
  log: (m: string) => void = () => {},
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const stem = basename(videoPath, extname(videoPath));
  const audioPath = join(workDir, `${stem}.wav`);

  log(`  → extracting audio`);
  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 -c:a pcm_s16le "${audioPath}"`,
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  log(`  → posting to Groq Whisper`);
  const groq = new Groq({ apiKey });
  const result = await groq.audio.transcriptions.create({
    file: createReadStream(audioPath) as any,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const r = result as any;
  return {
    text: r.text,
    duration: r.duration,
    words: (r.words ?? []).map((w: any) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
  };
}
