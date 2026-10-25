import { AgentComputer as Computer, type AgentComputerProps, type PanelViewport, type TakeoverUrls } from "@ghostystudio/computer/react";

/**
 * «La computadora del agente» de Sitios: el panel vive en `@ghostystudio/computer` (el mismo de
 * GTeams y /c). Aquí sólo quedan los adaptadores propios de EasyBits —ver en vivo y tomar el
 * control del navegador de un sitio— y el tema (brutalismo, en `app.css`, bloque `.gc-scope`).
 */

export type { TakeoverUrls };

/** Pide a EasyBits tomar el control de un navegador del turno en curso de un sitio. */
export async function requestTakeover(siteId: string, sessionId: string, viewport?: PanelViewport): Promise<TakeoverUrls> {
  const r = await fetch(`/api/v2/sites/${siteId}/takeover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, ...(viewport ? { viewport } : {}) }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo tomar el control");
  return d;
}

/** Pide la pestaña en vivo (sólo mirar) de un navegador del turno en curso. */
/** `viewport`: la medida del panel (la mide @ghostystudio/computer); la caja ajusta la página a esa forma. */
export async function requestWatch(siteId: string, sessionId: string, viewport?: PanelViewport): Promise<{ liveUrl: string; livekit?: { wsUrl: string; token: string } }> {
  const r = await fetch(`/api/v2/sites/${siteId}/watch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, ...(viewport ? { viewport } : {}) }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo ver el navegador en vivo");
  return d;
}

// Sitios es para gente no técnica: la terminal y lo genérico salen como tarjeta de trabajo y los
// diffs como «Antes / Ahora»; el comando queda en «Ver detalles técnicos» (investigación del
// 23-oct: la terminal cruda abruma, Lovable la esconde).
export function AgentComputer(props: AgentComputerProps) {
  return <Computer technical={false} {...props} />;
}
