import { AgentComputer as Computer, type AgentComputerProps, type TakeoverUrls } from "@ghostystudio/computer/react";

/**
 * «La computadora del agente» de Sitios: el panel vive en `@ghostystudio/computer` (el mismo de
 * GTeams y /c). Aquí sólo quedan los adaptadores propios de EasyBits —ver en vivo y tomar el
 * control del navegador de un sitio— y el tema (brutalismo, en `app.css`, bloque `.gc-scope`).
 */

export type { TakeoverUrls };

/** Pide a EasyBits tomar el control de un navegador del turno en curso de un sitio. */
export async function requestTakeover(siteId: string, sessionId: string): Promise<TakeoverUrls> {
  const r = await fetch(`/api/v2/sites/${siteId}/takeover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo tomar el control");
  return d;
}

/** Pide la pestaña en vivo (sólo mirar) de un navegador del turno en curso. */
export async function requestWatch(siteId: string, sessionId: string): Promise<{ liveUrl: string }> {
  const r = await fetch(`/api/v2/sites/${siteId}/watch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.liveUrl) throw new Error(d?.error ?? "No se pudo ver el navegador en vivo");
  return d;
}

export function AgentComputer(props: AgentComputerProps) {
  return <Computer {...props} />;
}
