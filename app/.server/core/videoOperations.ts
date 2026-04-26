/**
 * Video generation orchestration.
 *
 * Pipeline (conservación de personaje):
 *   1. Enhance prompt with Haiku (cinematography, shot type, lighting)
 *   2. Generate still via Gen-4 Image with optional character references
 *      (`@slug` tag injected into the prompt)
 *   3. Upload still to Tigris as a permanent File
 *   4. Animate still via Gen-4.5 image_to_video
 *   5. Download mp4, upload to Tigris as permanent File
 *   6. Log cost + increment quota
 *
 * Emits progress events via `onEvent` for SSE streaming to UI and MCP clients.
 */
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import {
  getPlatformDefaultClient,
  getPlatformPublicClient,
  buildPublicAssetUrl,
  resolveProvider,
  createStorageClient,
} from "../storage";
import { fileEvents } from "./fileEvents";
import { checkAiGenerationLimit, incrementAiGeneration, logAiUsage } from "../aiGenerationLimit";
import {
  generateStill,
  animateImage,
  imageRatioFor,
  toRunwayTag,
  type VideoAspectRatio,
  type VideoModel,
  type ReferenceImage,
} from "../runway";
import { resolveCharacter } from "./characterOperations";

export type VideoGenerationStatus =
  | "pending"
  | "enhancing"
  | "generating_still"
  | "animating"
  | "uploading"
  | "completed"
  | "failed";

export type VideoEvent =
  | { type: "status"; status: VideoGenerationStatus }
  | { type: "prompt-enhanced"; enhancedPrompt: string }
  | { type: "still-ready"; url: string; fileId?: string }
  | { type: "done"; videoFileId: string; videoUrl: string; stillFileId?: string | null; videoGenerationId: string }
  | { type: "error"; message: string };

export interface CreateVideoInput {
  prompt: string;
  /** Character id or slug. If set, its references are injected into the still generation. */
  character?: string;
  /** Direct reference image URL (first-frame). Used when no character is attached. */
  referenceImageUrl?: string;
  ratio?: VideoAspectRatio;
  duration?: number;
  model?: VideoModel;
  seed?: number;
}

// Rough cost estimates in MXN — approximate, used for user-facing "quedan X" display.
// Refine once Runway returns actual credits consumed.
const COST_MXN = {
  still: 1.0,
  videoFast: 5.0,   // gen4_turbo @ 5s
  videoHigh: 15.0,  // gen4.5 @ 5s
} as const;

function buildEnhancePrompt(input: {
  rawPrompt: string;
  ratio: VideoAspectRatio;
  hasCharacter: boolean;
  characterTag?: string;
  characterDescription?: string;
}): string {
  const aspectHint =
    input.ratio.startsWith("720:") || input.ratio === "832:1104"
      ? "vertical (9:16)"
      : input.ratio === "960:960"
        ? "square (1:1)"
        : "horizontal (16:9)";

  const characterBlock = input.hasCharacter && input.characterTag
    ? `\nIMPORTANT: The subject is a specific character referenced as @${input.characterTag}${input.characterDescription ? ` (${input.characterDescription})` : ""}. Your enhanced prompt MUST keep "@${input.characterTag}" literally and place the character as the subject. Do not rename or rephrase the tag.`
    : "";

  return `You are a cinematographer. Rewrite the user's idea into a single, detailed prompt for AI video generation.

User's idea:
"${input.rawPrompt}"

Output format: ${aspectHint}
${characterBlock}

Write ONE paragraph (max 90 words) that includes, in this order:
- Shot type (close-up / medium shot / wide / aerial)
- Subject and action (what is happening, in present tense)
- Setting and time of day
- Lighting quality (golden hour, overcast, neon, soft morning, etc.)
- Camera movement (static, slow push-in, dolly, handheld, crane, etc.)
- Overall mood (one adjective)

Rules:
- No bullet points, no line breaks, no quotes — plain prose only.
- No mention of "AI", "video", "generated", or "prompt".
- Keep cinematic and physical language; avoid abstract concepts.
- ${input.hasCharacter && input.characterTag ? `Preserve "@${input.characterTag}" EXACTLY as written.` : "Describe the subject concretely."}

Return ONLY the enhanced paragraph, nothing else.`;
}

async function enhancePrompt(opts: {
  rawPrompt: string;
  ratio: VideoAspectRatio;
  character?: { slug: string; description?: string | null } | null;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return opts.rawPrompt; // graceful fallback
  const anthropic = createAnthropic({ apiKey });
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: buildEnhancePrompt({
      rawPrompt: opts.rawPrompt,
      ratio: opts.ratio,
      hasCharacter: !!opts.character,
      characterTag: opts.character?.slug,
      characterDescription: opts.character?.description ?? undefined,
    }),
  });
  const cleaned = text.trim().replace(/^["']|["']$/g, "");
  return cleaned || opts.rawPrompt;
}

async function uploadToTigris(
  userId: string,
  buffer: Buffer,
  contentType: string,
  filename: string,
  opts?: { public?: boolean },
): Promise<{ file: Awaited<ReturnType<typeof db.file.create>>; publicUrl?: string }> {
  const isPublic = opts?.public ?? false;
  const provider = isPublic ? null : await resolveProvider(userId);
  const storageKey = `${userId}/${nanoid(6)}-${filename}`;

  if (isPublic) {
    const client = getPlatformPublicClient();
    const putUrl = await client.getPutUrl(storageKey, { timeout: 180 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": contentType },
    });
    if (!putRes.ok) throw new Error(`Failed to upload to Tigris: ${putRes.status}`);
    const publicUrl = buildPublicAssetUrl(storageKey);
    const file = await db.file.create({
      data: {
        name: filename,
        storageKey,
        slug: storageKey,
        size: buffer.length,
        contentType,
        ownerId: userId,
        access: "public",
        url: publicUrl,
        status: "DONE",
        source: "runway",
      },
    });
    return { file, publicUrl };
  }

  const client = provider ? createStorageClient(provider) : getPlatformDefaultClient();
  const putUrl = await client.getPutUrl(storageKey, { timeout: 180 });
  const putRes = await fetch(putUrl, {
    method: "PUT",
    body: new Uint8Array(buffer),
    headers: { "Content-Type": contentType },
  });
  if (!putRes.ok) throw new Error(`Failed to upload to Tigris: ${putRes.status}`);

  const file = await db.file.create({
    data: {
      name: filename,
      storageKey,
      slug: storageKey,
      size: buffer.length,
      contentType,
      ownerId: userId,
      access: "private",
      url: "",
      status: "DONE",
      storageProviderId: provider?.id ?? null,
      source: "runway",
    },
  });
  return { file };
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Runway asset: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function listVideoGenerations(userId: string, limit = 50) {
  return db.videoGeneration.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { character: true },
  });
}

export async function getVideoGeneration(id: string, userId: string) {
  const gen = await db.videoGeneration.findUnique({
    where: { id },
    include: { character: true },
  });
  if (!gen || gen.ownerId !== userId) throw new Error("Video generation not found");
  return gen;
}

export async function deleteVideoGeneration(id: string, userId: string) {
  const gen = await getVideoGeneration(id, userId);
  return db.videoGeneration.delete({ where: { id: gen.id } });
}

/**
 * Main orchestration: prompt → still → animated video. Accepts an `onEvent`
 * callback so the HTTP SSE endpoint and MCP tools can stream status updates.
 */
export async function createVideo(
  ctx: AuthContext,
  input: CreateVideoInput,
  onEvent: (ev: VideoEvent) => void = () => {},
) {
  requireScope(ctx, "WRITE");
  const userId = ctx.user.id;

  if (!input.prompt?.trim()) throw new Error("prompt is required");

  const genLimit = await checkAiGenerationLimit(userId);
  if (!genLimit.allowed) {
    throw new Error(
      `Generation limit reached (${genLimit.limit}/month). Upgrade or buy a pack at https://www.easybits.cloud/planes`,
    );
  }

  const character = await resolveCharacter(userId, input.character);
  const ratio: VideoAspectRatio = input.ratio ?? (character ? "1280:720" : "1280:720");
  const duration = Math.max(2, Math.min(10, input.duration ?? 5));
  const model: VideoModel = input.model ?? "gen4.5";

  // Persist lifecycle row immediately so clients can reconnect / poll by id.
  const row = await db.videoGeneration.create({
    data: {
      ownerId: userId,
      prompt: input.prompt.trim(),
      status: "pending",
      characterId: character?.id,
      referenceImageUrl: input.referenceImageUrl ?? null,
      model,
      aspectRatio: ratio,
      duration,
      seed: input.seed,
      runwayTaskIds: [],
    },
  });

  const updateRow = (data: Record<string, unknown>) =>
    db.videoGeneration.update({ where: { id: row.id }, data: data as any });

  try {
    // 1) Enhance prompt
    onEvent({ type: "status", status: "enhancing" });
    await updateRow({ status: "enhancing" });
    const enhanced = await enhancePrompt({
      rawPrompt: input.prompt,
      ratio,
      character: character
        ? { slug: character.slug, description: character.description }
        : null,
    });
    onEvent({ type: "prompt-enhanced", enhancedPrompt: enhanced });
    await updateRow({ enhancedPrompt: enhanced });
    logAiUsage(userId, {
      type: "enhance",
      product: "video",
      modelId: "claude-haiku-4-5-20251001",
      resourceId: row.id,
    });

    // 2) Build still (either use provided referenceImageUrl directly, or generate)
    let stillUrl: string;
    let stillFileId: string | null = null;
    let stillPublicUrl: string | null = null;

    if (input.referenceImageUrl && !character) {
      // User attached a photo — skip still gen, animate that photo directly.
      stillUrl = input.referenceImageUrl;
      onEvent({ type: "still-ready", url: stillUrl });
    } else {
      onEvent({ type: "status", status: "generating_still" });
      await updateRow({ status: "generating_still" });

      const references: ReferenceImage[] = character
        ? character.referenceImageUrls.map((uri) => ({ uri, tag: character.slug }))
        : [];

      // If the enhanced prompt doesn't already mention @slug, prepend it so
      // Gen-4 Image uses the references for identity.
      let promptForStill = enhanced;
      if (character && !promptForStill.includes(`@${character.slug}`)) {
        promptForStill = `@${character.slug} — ${promptForStill}`;
      }

      const still = await generateStill({
        prompt: promptForStill,
        ratio: imageRatioFor(ratio),
        references,
        seed: input.seed,
      });

      logAiUsage(userId, {
        type: "still",
        product: "video",
        modelId: "gen4_image",
        resourceId: row.id,
      });

      // Copy to our storage (Runway URL expires in 24-48h). Public so Runway's
      // image_to_video can fetch it back as an HTTPS URL.
      const stillBuf = await downloadToBuffer(still.url);
      const stillUpload = await uploadToTigris(userId, stillBuf, "image/png", "still.png", { public: true });
      stillFileId = stillUpload.file.id;
      stillPublicUrl = stillUpload.publicUrl ?? null;
      stillUrl = stillPublicUrl ?? still.url;

      await updateRow({
        stillFileId,
        runwayTaskIds: { push: still.taskId } as any,
      });
      onEvent({ type: "still-ready", url: stillUrl, fileId: stillFileId });
    }

    // 3) Animate
    onEvent({ type: "status", status: "animating" });
    await updateRow({ status: "animating" });

    const video = await animateImage({
      promptImage: stillUrl,
      promptText: enhanced,
      ratio,
      duration,
      model,
      seed: input.seed,
    });

    // 4) Upload mp4 to Tigris as private File (counts in user's quota)
    onEvent({ type: "status", status: "uploading" });
    await updateRow({
      status: "uploading",
      runwayTaskIds: { push: video.taskId } as any,
    });

    const videoBuf = await downloadToBuffer(video.url);
    const safePrompt = input.prompt
      .slice(0, 40)
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "video";
    const filename = `${safePrompt}.mp4`;
    const videoUpload = await uploadToTigris(userId, videoBuf, "video/mp4", filename, { public: false });

    // 5) Wrap up — increment quota + log + mark completed
    const cost = (character || input.referenceImageUrl ? 0 : COST_MXN.still) +
      (model === "gen4_turbo" ? COST_MXN.videoFast : COST_MXN.videoHigh) * (duration / 5);

    await updateRow({
      status: "completed",
      videoFileId: videoUpload.file.id,
      costMxn: cost,
    });

    await incrementAiGeneration(userId, (ctx.user.metadata as any)?.plan, {
      type: "animate",
      product: "video",
      modelId: model,
      resourceId: row.id,
      durationMs: undefined,
    });

    fileEvents.emit("file:changed", userId);

    onEvent({
      type: "done",
      videoFileId: videoUpload.file.id,
      videoUrl: video.url, // Runway URL for immediate preview; the persisted File is private
      stillFileId,
      videoGenerationId: row.id,
    });

    return {
      videoGenerationId: row.id,
      videoFileId: videoUpload.file.id,
      stillFileId,
      videoUrl: video.url,
      stillUrl,
      prompt: input.prompt,
      enhancedPrompt: enhanced,
      character: character
        ? { id: character.id, name: character.name, slug: character.slug }
        : null,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    await updateRow({ status: "failed", failReason: message });
    onEvent({ type: "error", message });
    throw err;
  }
}
