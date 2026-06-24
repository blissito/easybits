import { useEffect } from "react";

/**
 * "Heartfelt thanks from the founder" modal — estilo Basecamp.
 * Aparece al comprar plan o al montar un sandbox permanente.
 *
 * TODO(bliss): reemplazar `FOUNDER.photo` y `FOUNDER.signature` con los assets
 * reales (foto del fundador + imagen de la firma). Confirmar `name` y `email`.
 */
const FOUNDER = {
  name: "Héctorbliss",
  role: "fundador de EasyBits",
  photo: "/images/founder.jpg", // ← subir tu foto a public/images/founder.jpg; cae a avatar_default si falla
  signature: "/images/firma.png", // ← subir imagen de firma (opcional)
  email: "fixtergeek@gmail.com",
};

export function ThankYouModal({
  kind = "plan",
  onClose,
}: {
  /** "plan" = compró suscripción · "machine" = montó una VM permanente */
  kind?: "plan" | "machine";
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border-2 border-black rounded-2xl w-full max-w-md shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="px-7 pt-7 pb-5">
          <div className="flex flex-col items-center text-center">
            <img
              src={FOUNDER.photo}
              alt={FOUNDER.name}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/avatar_default.svg"; }}
              className="w-20 h-20 rounded-full object-cover border-2 border-black"
            />
            <p className="mt-3 text-sm text-iron">
              Un mensaje de <span className="font-bold text-black">{FOUNDER.name}</span>, {FOUNDER.role}
            </p>
          </div>

          <hr className="my-5 border-gray-200" />

          <h2 className="text-xl font-black mb-3">
            {kind === "machine" ? "¡Gracias por confiar tu infraestructura a EasyBits!" : "¡Gracias por ser cliente de EasyBits!"}
          </h2>

          <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
            <p>
              Somos una empresa independiente, sostenida por nuestros usuarios — no por inversionistas.
              {kind === "machine"
                ? " Cada sandbox que enciendes nos ayuda a seguir construyendo."
                : " Tu suscripción hace posible EasyBits."}
            </p>
            <p>
              Llevamos años construyendo el mejor storage agentic-first: que tus agentes de IA guarden,
              gestionen y publiquen archivos —y ahora corran VMs— por SDK, MCP y API. Nos honra tenerte en el equipo.
            </p>
            <p>
              Si alguna vez necesitas algo, escríbeme directo a{" "}
              <a href={`mailto:${FOUNDER.email}`} className="font-medium underline">{FOUNDER.email}</a>. Aquí estoy para ti.
            </p>
            <p>Gracias de nuevo, y mucho éxito,</p>
          </div>

          <img
            src={FOUNDER.signature}
            alt="Firma"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            className="mt-3 h-12"
          />
          <p className="text-sm text-gray-600">{FOUNDER.name}, {FOUNDER.role}</p>
        </div>

        <button
          type="button" onClick={onClose}
          className="w-full bg-brand-500 text-white font-bold py-4 border-t-2 border-black hover:bg-brand-500/90 transition-colors"
        >
          {kind === "machine" ? "¡Genial, ver mi sandbox!" : "¡Genial, volver a EasyBits!"}
        </button>
      </div>
    </div>
  );
}
