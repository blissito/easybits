import { useState, useRef, useEffect } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/new";
import { getUserOrRedirect } from "~/.server/getters";
import { listCharacters } from "~/.server/core/characterOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";

export const meta = () => [
  { title: "Nuevo video — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const characters = await listCharacters(user.id);
  return { characters };
};

type Step = "idle" | "enhancing" | "generating_still" | "animating" | "uploading" | "done" | "error";

const RATIOS = [
  { value: "1280:720", label: "16:9 — Landing", box: "aspect-video" },
  { value: "720:1280", label: "9:16 — Social / WhatsApp", box: "aspect-[9/16] h-16" },
  { value: "960:960", label: "1:1 — Cuadrado", box: "aspect-square h-16" },
] as const;

const STEPS: Record<Step, { label: string; emoji: string }> = {
  idle: { label: "Listo para generar", emoji: "✨" },
  enhancing: { label: "Pensando la toma…", emoji: "🎬" },
  generating_still: { label: "Generando personaje y escena…", emoji: "🖼" },
  animating: { label: "Animando (esto tarda 60–120s)…", emoji: "🎥" },
  uploading: { label: "Guardando tu video…", emoji: "☁️" },
  done: { label: "¡Listo!", emoji: "🎉" },
  error: { label: "Algo salió mal", emoji: "⚠️" },
};

export default function NewVideo() {
  const { characters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCharacter = searchParams.get("character");

  const [prompt, setPrompt] = useState("");
  const [character, setCharacter] = useState<string>(preselectedCharacter || "");
  const [ratio, setRatio] = useState<"1280:720" | "720:1280" | "960:960">("1280:720");
  const [duration, setDuration] = useState(5);
  const [model, setModel] = useState<"gen4.5" | "gen4_turbo">("gen4.5");
  const [step, setStep] = useState<Step>("idle");
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>("");
  const [stillUrl, setStillUrl] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoGenerationId, setVideoGenerationId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const generating = step !== "idle" && step !== "done" && step !== "error";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStep("enhancing");
    setEnhancedPrompt("");
    setStillUrl("");
    setVideoUrl("");
    setError("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/v2/video-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          character: character || undefined,
          ratio,
          duration,
          model,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Split by SSE frame (double newline)
        const frames = buf.split("\n\n");
        buf = frames.pop() || "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          let data: any;
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (eventName === "status") setStep(data.status);
          else if (eventName === "prompt-enhanced") setEnhancedPrompt(data.enhancedPrompt);
          else if (eventName === "still-ready") setStillUrl(data.url);
          else if (eventName === "done") {
            setStep("done");
            setVideoUrl(data.videoUrl);
            setVideoGenerationId(data.videoGenerationId);
          } else if (eventName === "error") {
            setStep("error");
            setError(data.message);
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setStep("error");
      setError(e?.message || "Error desconocido");
    }
  }

  const selectedCharacter = character
    ? characters.find((c) => c.slug === character || c.id === character)
    : null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <button onClick={() => navigate("/dash/videos")} className="text-sm text-gray-600 hover:underline mb-2">
          ← Videos
        </button>
        <h1 className="text-3xl font-bold">Nuevo video</h1>
        <p className="text-gray-600 text-sm mt-1">
          Describe la escena. Nosotros elegimos el plano, la luz y el movimiento de cámara.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-5">
          <label className="block">
            <span className="block text-sm font-semibold mb-2">¿Qué quieres ver?</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generating}
              rows={4}
              placeholder={selectedCharacter
                ? `Ej: Caminando por la playa al atardecer, cámara en dolly lento`
                : `Ej: Una gata naranja caminando por la playa al atardecer`}
              className="w-full border-2 border-black rounded-xl px-4 py-3 resize-none"
              maxLength={800}
              required
            />
            <span className="block text-xs text-gray-500 mt-1">
              {selectedCharacter
                ? `El personaje @${selectedCharacter.slug} se conservará automáticamente — no lo describas.`
                : "Mantén la descripción concreta. La IA añade el resto."}
            </span>
          </label>

          {characters.length > 0 && (
            <label className="block">
              <span className="block text-sm font-semibold mb-2">Personaje (opcional)</span>
              <select
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                disabled={generating}
                className="w-full border-2 border-black rounded-xl px-4 py-3 bg-white"
              >
                <option value="">— Sin personaje recurrente —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name} (@{c.slug})</option>
                ))}
              </select>
              <span className="block text-xs text-gray-500 mt-1">
                Usa un personaje guardado para mantener la misma cara entre videos.
              </span>
            </label>
          )}

          <div>
            <span className="block text-sm font-semibold mb-2">Formato</span>
            <div className="grid grid-cols-3 gap-2">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  disabled={generating}
                  className={cn(
                    "border-2 border-black rounded-xl p-3 text-xs font-semibold transition-all",
                    ratio === r.value ? "bg-brand-500" : "bg-white hover:bg-gray-50",
                  )}
                >
                  <div className={cn("mx-auto mb-2 border-2 border-black bg-gray-100", r.box)} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-semibold mb-2">Duración</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={generating}
                className="w-full border-2 border-black rounded-xl px-4 py-3 bg-white"
              >
                <option value="5">5 segundos</option>
                <option value="10">10 segundos</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold mb-2">Calidad</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as any)}
                disabled={generating}
                className="w-full border-2 border-black rounded-xl px-4 py-3 bg-white"
              >
                <option value="gen4.5">Cine (Gen-4.5)</option>
                <option value="gen4_turbo">Rápido (Gen-4 Turbo)</option>
              </select>
            </label>
          </div>

          <BrutalButton type="submit" isLoading={generating} isDisabled={!prompt.trim()}>
            {generating ? STEPS[step].label : "Generar video"}
          </BrutalButton>
        </form>

        {/* Progress / Preview */}
        <div className="border-2 border-black rounded-xl bg-white overflow-hidden">
          <div className="border-b-2 border-black p-4 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-xl">{STEPS[step].emoji}</span>
              <span className="font-semibold text-sm">{STEPS[step].label}</span>
            </div>
            {enhancedPrompt && (
              <div className="mt-3 text-xs text-gray-600 border-t border-gray-200 pt-3">
                <span className="font-semibold text-black">Dirección:</span> {enhancedPrompt}
              </div>
            )}
          </div>

          <div className="p-6">
            {step === "idle" && (
              <div className="aspect-video bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-400">
                Preview aparecerá aquí
              </div>
            )}

            {(step === "enhancing" || step === "generating_still") && (
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-black rounded-xl flex items-center justify-center animate-pulse">
                <div className="text-gray-500 text-sm">Generando still…</div>
              </div>
            )}

            {(step === "animating" || step === "uploading") && stillUrl && (
              <div className="relative">
                <img src={stillUrl} alt="Still" className="w-full border-2 border-black rounded-xl" />
                <div className="absolute inset-0 bg-black/40 border-2 border-black rounded-xl flex items-center justify-center">
                  <div className="text-white font-semibold animate-pulse">
                    {step === "animating" ? "Animando…" : "Subiendo…"}
                  </div>
                </div>
              </div>
            )}

            {step === "done" && videoUrl && (
              <div className="space-y-3">
                <video src={videoUrl} controls autoPlay loop className="w-full border-2 border-black rounded-xl" />
                <div className="flex gap-2">
                  <BrutalButton onClick={() => navigate(`/dash/videos/${videoGenerationId}`)}>
                    Ver detalle
                  </BrutalButton>
                  <BrutalButton mode="ghost" onClick={() => {
                    setStep("idle"); setPrompt(""); setEnhancedPrompt(""); setStillUrl(""); setVideoUrl("");
                  }}>
                    Hacer otro
                  </BrutalButton>
                </div>
              </div>
            )}

            {step === "error" && (
              <div className="p-4 border-2 border-red-500 rounded-xl bg-red-50 text-red-900 text-sm">
                {error}
                <div className="mt-3">
                  <BrutalButton mode="ghost" onClick={() => setStep("idle")}>Reintentar</BrutalButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
