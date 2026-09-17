// Visor de /openapi.yaml con Scalar. Se carga desde CDN y sólo en el cliente: el bundle de
// Scalar pesa más que todos los docs juntos, y sólo lo necesita esta página.
//
// ⚠️ Se monta por la API programática (`Scalar.createApiReference`) y no con el
// `<script id="api-reference" data-url>` de la guía rápida: ese autoarranque lee el DOM al
// cargar el script y, inyectado desde React, pintaba el cascarón sin bajar nunca el YAML.
import { useEffect, useRef } from "react";

const SCALAR_SRC = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1/dist/browser/standalone.js";

declare global {
  interface Window {
    Scalar?: { createApiReference: (el: HTMLElement, cfg: Record<string, unknown>) => { destroy?: () => void } };
  }
}

export function ApiReference() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let app: { destroy?: () => void } | undefined;
    const mount = () => {
      if (!window.Scalar || !host.current) return;
      app = window.Scalar.createApiReference(host.current, {
        url: "/openapi.yaml",
        layout: "classic",
        showSidebar: false,
        hideDarkModeToggle: true,
        forceDarkModeState: "light",
        // «Try it» activo: la persona pega su token (Dashboard de Desarrollador → API keys) en
        // el campo de auth de Scalar y ejecuta contra la API real, misma origin. No hay
        // llave de demo precargada: sería abrir la cuenta de alguien a cualquiera.
        authentication: { preferredSecurityScheme: "apiKey" },
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      });
    };
    if (window.Scalar) {
      mount();
    } else {
      const s = document.createElement("script");
      s.src = SCALAR_SRC;
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    }
    return () => {
      app?.destroy?.();
      el.innerHTML = "";
    };
  }, []);
  return <div ref={host} className="rounded-2xl border-2 border-black overflow-hidden min-h-[400px]" />;
}
