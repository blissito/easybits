import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { data } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { BrutalButton } from "~/components/common/BrutalButton";
import {
  listBrandKits,
  createBrandKit,
  updateBrandKit,
  deleteBrandKit,
} from "~/.server/core/brandKitOperations";
import type { Route } from "./+types/brand-kits";

export const meta = () => [
  { title: "Brand Kits — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const kits = await listBrandKits(user.id);
  return { kits };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    if (!name) return data({ error: "El nombre es requerido" });
    const colors = JSON.parse(String(formData.get("colors") || "{}"));
    const fontsRaw = formData.get("fonts");
    const fonts = fontsRaw ? JSON.parse(String(fontsRaw)) : undefined;
    const logoUrl = String(formData.get("logoUrl") || "") || undefined;
    const mood = String(formData.get("mood") || "") || undefined;
    await createBrandKit(user.id, { name, colors, fonts, logoUrl, mood });
    return { ok: true };
  }

  if (intent === "update") {
    const id = String(formData.get("id"));
    const name = String(formData.get("name") || "").trim();
    const colors = JSON.parse(String(formData.get("colors") || "{}"));
    const fontsRaw = formData.get("fonts");
    const fonts = fontsRaw ? JSON.parse(String(fontsRaw)) : undefined;
    const isDefault = formData.get("isDefault") === "true";
    await updateBrandKit(id, user.id, { name, colors, fonts, isDefault });
    return { ok: true };
  }

  if (intent === "delete") {
    const id = String(formData.get("id"));
    await deleteBrandKit(id, user.id);
    return { ok: true };
  }

  if (intent === "toggle-default") {
    const id = String(formData.get("id"));
    const isDefault = formData.get("isDefault") === "true";
    await updateBrandKit(id, user.id, { isDefault });
    return { ok: true };
  }

  return data({ error: "Intent desconocido" });
};

const DEFAULT_COLORS = {
  primary: "#6366f1",
  secondary: "#8b5cf6",
  accent: "#f59e0b",
  surface: "#f8fafc",
};

interface ExtraColor {
  name: string;
  hex: string;
}

interface BrandKitForm {
  name: string;
  colors: typeof DEFAULT_COLORS & { extras?: ExtraColor[] };
  fonts: { heading: string; body: string };
  mood: string;
}

const EMPTY_FORM: BrandKitForm = {
  name: "",
  colors: { ...DEFAULT_COLORS },
  fonts: { heading: "Inter", body: "Inter" },
  mood: "",
};

const MOODS = ["dark", "light", "warm", "cool", "vibrant"];

export default function BrandKitsPage() {
  const { kits } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandKitForm>({ ...EMPTY_FORM });

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(kit: any) {
    setEditId(kit.id);
    const c = kit.colors as any;
    setForm({
      name: kit.name,
      colors: { primary: c.primary, secondary: c.secondary, accent: c.accent, surface: c.surface, extras: c.extras || [] },
      fonts: (kit.fonts as any) || { heading: "Inter", body: "Inter" },
      mood: kit.mood || "",
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("intent", editId ? "update" : "create");
    if (editId) fd.set("id", editId);
    fd.set("name", form.name);
    fd.set("colors", JSON.stringify(form.colors));
    fd.set("fonts", JSON.stringify(form.fonts));
    fd.set("mood", form.mood);
    fetcher.submit(fd, { method: "POST" });
    setShowForm(false);
    setEditId(null);
  }

  return (
    <article className="pt-20 md:pt-8 px-4 sm:px-8 pb-24 mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
          Brand Kits
        </h1>
        <div className="flex-1" />
        <BrutalButton type="button" onClick={openCreate} size="chip">
          + Nuevo Kit
        </BrutalButton>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="mb-6 border-2 border-black rounded-xl bg-white p-4 shadow-[4px_4px_0_#000]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-1">Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Ej: Cliente X, Mi marca..."
                className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Colores</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    { key: "primary" as const, label: "Principal" },
                    { key: "secondary" as const, label: "Secundario" },
                    { key: "accent" as const, label: "Acento" },
                    { key: "surface" as const, label: "Superficie" },
                  ] as const
                ).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="color"
                      value={form.colors[c.key]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          colors: { ...form.colors, [c.key]: e.target.value },
                        })
                      }
                      className="w-8 h-8 rounded cursor-pointer border-2 border-black p-0"
                    />
                    {c.label}
                  </label>
                ))}
              </div>

              {/* Extra colors */}
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-500">Colores extra</span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        colors: {
                          ...form.colors,
                          extras: [...(form.colors.extras || []), { name: "", hex: "#000000" }],
                        },
                      })
                    }
                    className="text-xs font-bold text-brand-600 hover:text-brand-800"
                  >
                    + Agregar color
                  </button>
                </div>
                {(form.colors.extras || []).map((extra, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      type="color"
                      value={extra.hex}
                      onChange={(e) => {
                        const extras = [...(form.colors.extras || [])];
                        extras[i] = { ...extras[i], hex: e.target.value };
                        setForm({ ...form, colors: { ...form.colors, extras } });
                      }}
                      className="w-8 h-8 rounded cursor-pointer border-2 border-black p-0"
                    />
                    <input
                      value={extra.name}
                      onChange={(e) => {
                        const extras = [...(form.colors.extras || [])];
                        extras[i] = { ...extras[i], name: e.target.value };
                        setForm({ ...form, colors: { ...form.colors, extras } });
                      }}
                      placeholder="Nombre del color"
                      className="flex-1 px-2 py-1 text-sm border-2 border-black rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const extras = (form.colors.extras || []).filter((_, j) => j !== i);
                        setForm({ ...form, colors: { ...form.colors, extras } });
                      }}
                      className="text-red-500 hover:text-red-700 font-bold text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold mb-1">
                  Fuente encabezados
                </label>
                <input
                  value={form.fonts.heading}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fonts: { ...form.fonts, heading: e.target.value },
                    })
                  }
                  placeholder="Space Grotesk"
                  className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  Fuente cuerpo
                </label>
                <input
                  value={form.fonts.body}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fonts: { ...form.fonts, body: e.target.value },
                    })
                  }
                  placeholder="Inter"
                  className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Mood</label>
              <div className="flex gap-2 flex-wrap">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm({ ...form, mood: form.mood === m ? "" : m })}
                    className={`px-3 py-1 text-sm font-bold rounded-lg border-2 transition-all ${
                      form.mood === m
                        ? "border-black bg-black text-white"
                        : "border-gray-300 bg-white hover:border-black"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <BrutalButton
                type="button"
                mode="ghost"
                size="chip"
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                }}
              >
                Cancelar
              </BrutalButton>
              <BrutalButton type="submit" size="chip">
                {editId ? "Guardar" : "Crear Kit"}
              </BrutalButton>
            </div>
          </form>
        </div>
      )}

      {/* Kit list */}
      {kits.length === 0 && !showForm ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 mb-3">
            No tienes brand kits todavia
          </p>
          <p className="text-sm text-gray-400 mb-4">
            Crea uno manualmente o extrae los colores de un documento existente
          </p>
          <BrutalButton type="button" onClick={openCreate} size="chip">
            + Crear Brand Kit
          </BrutalButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {kits.map((kit: any) => (
            <div
              key={kit.id}
              className="border-2 border-black rounded-xl bg-white p-4 shadow-[4px_4px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-black text-sm flex-1 truncate">{kit.name}</h3>
                {kit.isDefault && (
                  <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full border border-brand-200">
                    Default
                  </span>
                )}
              </div>

              {/* Color swatches */}
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {["primary", "secondary", "accent", "surface"].map((key) => (
                  <div
                    key={key}
                    className="w-8 h-8 rounded-lg border-2 border-black"
                    style={{ backgroundColor: (kit.colors as any)?.[key] || "#ccc" }}
                    title={key}
                  />
                ))}
                {((kit.colors as any)?.extras || []).map((extra: any, i: number) => (
                  <div
                    key={`extra-${i}`}
                    className="w-8 h-8 rounded-lg border-2 border-black"
                    style={{ backgroundColor: extra.hex }}
                    title={extra.name || `extra ${i + 1}`}
                  />
                ))}
              </div>

              {/* Fonts */}
              {kit.fonts && (
                <p className="text-xs text-gray-500 mb-3">
                  {(kit.fonts as any).heading} + {(kit.fonts as any).body}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(kit)}
                  className="text-xs font-bold text-gray-600 hover:text-black"
                >
                  Editar
                </button>
                <button
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("intent", "toggle-default");
                    fd.set("id", kit.id);
                    fd.set("isDefault", kit.isDefault ? "false" : "true");
                    fetcher.submit(fd, { method: "POST" });
                  }}
                  className="text-xs font-bold text-gray-600 hover:text-brand-600"
                >
                  {kit.isDefault ? "Quitar default" : "Marcar default"}
                </button>
                <button
                  onClick={() => {
                    if (!confirm("Eliminar este brand kit?")) return;
                    const fd = new FormData();
                    fd.set("intent", "delete");
                    fd.set("id", kit.id);
                    fetcher.submit(fd, { method: "POST" });
                  }}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
