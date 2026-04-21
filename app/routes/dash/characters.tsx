import { useState, useRef } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/characters";
import { getUserOrRedirect } from "~/.server/getters";
import { listCharacters } from "~/.server/core/characterOperations";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";

export const meta = () => [
  { title: "Personajes — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const characters = await listCharacters(user.id);
  return { characters };
};

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function resizeIfNeeded(dataUrl: string, maxDim = 1280): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = Math.max(img.width, img.height);
      if (max <= maxDim) return resolve(dataUrl);
      const scale = maxDim / max;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function Characters() {
  const { characters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Personajes</h1>
          <p className="text-gray-600 text-sm mt-1">
            Referencias reutilizables. Cuando generes videos con el mismo personaje,
            la cara se mantiene consistente entre escenas.
          </p>
        </div>
        <BrutalButton onClick={() => setCreating(true)}>+ Nuevo personaje</BrutalButton>
      </header>

      {characters.length === 0 && !creating ? (
        <div className="border-2 border-dashed border-black rounded-xl p-12 text-center">
          <div className="text-5xl mb-3">👤</div>
          <div className="text-lg font-semibold mb-2">Aún no tienes personajes guardados</div>
          <p className="text-gray-600 text-sm mb-4 max-w-md mx-auto">
            Sube 1–3 fotos de una persona, mascota o mascota de marca. Después podrás usarlos en
            cualquier video para mantener la misma apariencia.
          </p>
          <BrutalButton onClick={() => setCreating(true)}>Crear primer personaje</BrutalButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((c) => (
            <div key={c.id} className="border-2 border-black rounded-xl overflow-hidden bg-white">
              <div className="grid grid-cols-3 border-b-2 border-black">
                {c.referenceImageUrls.slice(0, 3).map((url, i) => (
                  <div key={i} className={cn("aspect-square bg-gray-100", i > 0 && "border-l-2 border-black")}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 3 - c.referenceImageUrls.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className={cn(
                      "aspect-square bg-gray-100 flex items-center justify-center text-gray-300",
                      (c.referenceImageUrls.length + i) > 0 && "border-l-2 border-black",
                    )}
                  >
                    ·
                  </div>
                ))}
              </div>
              <div className="p-4">
                <div className="font-bold">{c.name}</div>
                <div className="text-xs text-gray-500 mb-2">@{c.slug}</div>
                {c.description && <p className="text-sm text-gray-700 mb-3 line-clamp-2">{c.description}</p>}
                <div className="flex gap-2">
                  <BrutalButton
                    size="chip"
                    onClick={() => navigate(`/dash/videos/new?character=${c.slug}`)}
                  >
                    Usar en video
                  </BrutalButton>
                  <BrutalButton
                    size="chip"
                    mode="danger"
                    onClick={async () => {
                      if (!confirm(`¿Borrar ${c.name}?`)) return;
                      const res = await fetch(`/api/v2/characters/${c.id}`, { method: "DELETE" });
                      if (res.ok) window.location.reload();
                    }}
                  >
                    Borrar
                  </BrutalButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CharacterModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CharacterModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const remaining = 3 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newUrls: string[] = [];
    for (const f of toAdd) {
      if (!f.type.startsWith("image/")) { setError("Solo imágenes"); continue; }
      if (f.size > 8 * 1024 * 1024) { setError("Máx 8MB por foto"); continue; }
      const raw = await readAsDataUrl(f);
      const resized = await resizeIfNeeded(raw, 1280);
      newUrls.push(resized);
    }
    setPhotos((prev) => [...prev, ...newUrls].slice(0, 3));
  }

  async function onSave() {
    if (!name.trim()) { setError("Nombre requerido"); return; }
    if (photos.length === 0) { setError("Al menos una foto"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/v2/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, photos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white border-2 border-black rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b-2 border-black flex items-center justify-between">
          <h2 className="text-xl font-bold">Nuevo personaje</h2>
          <button onClick={onClose} className="text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <label className="block">
            <span className="block text-sm font-semibold mb-2">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sofía, Luna mi gata, Don Beto"
              className="w-full border-2 border-black rounded-xl px-4 py-3"
              maxLength={60}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="block text-sm font-semibold mb-2">Descripción <span className="text-gray-400 font-normal">(opcional)</span></span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: gata naranja atigrada con collar azul"
              className="w-full border-2 border-black rounded-xl px-4 py-3"
              maxLength={200}
            />
            <span className="block text-xs text-gray-500 mt-1">
              Ayuda al director de cine interno a componer mejor las escenas.
            </span>
          </label>

          <div>
            <span className="block text-sm font-semibold mb-2">
              Fotos de referencia ({photos.length}/3)
            </span>
            <span className="block text-xs text-gray-500 mb-3">
              Recomendado: 2 fotos — una de la cara y otra del cuerpo completo. Ángulos distintos dan mejor consistencia.
            </span>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square border-2 border-black rounded-xl overflow-hidden">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-white border-2 border-black rounded-full w-6 h-6 text-xs"
                  >×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-black rounded-xl flex items-center justify-center text-4xl text-gray-400 hover:bg-gray-50"
                >+</button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {error && (
            <div className="p-3 border-2 border-red-500 rounded-xl bg-red-50 text-red-900 text-sm">{error}</div>
          )}
        </div>

        <div className="p-6 border-t-2 border-black flex justify-end gap-3">
          <BrutalButton mode="ghost" onClick={onClose} isDisabled={saving}>Cancelar</BrutalButton>
          <BrutalButton onClick={onSave} isLoading={saving}>Guardar personaje</BrutalButton>
        </div>
      </div>
    </div>
  );
}
