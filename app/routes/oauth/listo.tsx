import { useState } from "react";
import { BrandLogo } from "~/components/common/BrandLogo";
import { BrutalButton } from "~/components/common/BrutalButton";

export const meta = () => [
  { title: "Conectado — EasyBits" },
  { name: "robots", content: "noindex" },
];

const closeHint = () =>
  navigator.platform.toLowerCase().includes("mac") ? "⌘W" : "Ctrl+W";

/**
 * Cierre del flujo OAuth de un cliente MCP (Ghosty Code, Claude Code, etc.).
 * El CLI recibe el `code` en su servidor loopback y redirige aquí, así la
 * última pantalla del setup es la marca y no un texto plano del binario.
 */
export default function OauthListo() {
  const [blocked, setBlocked] = useState(false);

  // window.close() sólo obedece en ventanas que abrió un script. Ésta la abrió
  // el CLI, así que el navegador puede ignorarlo: si seguimos aquí, lo decimos.
  const close = () => {
    window.close();
    setTimeout(() => setBlocked(true), 300);
  };

  return (
    <main className="min-h-svh bg-black text-white grid place-items-center px-6 py-10 text-center">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <BrandLogo size="hero" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Tu agente ya tiene dónde trabajar
        </h1>
        <p className="mt-3 text-tale">
          Levanta cajas para agentes o aplicaciones.
        </p>
        <p className="mt-6 font-mono text-sm text-brand-500">
          Vuelve a tu terminal
        </p>
        <div className="mt-8 flex justify-center">
          <BrutalButton onClick={close}>Cerrar esta ventana</BrutalButton>
        </div>
        {blocked && (
          <p className="mt-4 text-sm text-tale">
            Tu navegador no deja cerrar pestañas que no abrió él. Ciérrala con{" "}
            <kbd className="font-mono text-white">{closeHint()}</kbd>.
          </p>
        )}
      </div>
    </main>
  );
}
