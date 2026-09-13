import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { sendTransactional } from "../emails/sendTransactional";
import { restartMachine, type Runspec } from "./releaseOperations";
import { callHost, type SandboxRecord } from "./sandboxOperations";

/**
 * Monitor de los sitios vendidos: sondea cada dominio y, si no responde,
 * reinicia la app y avisa.
 *
 * Existe porque brendago.studio estuvo ~5h en 502 (2026-09-12) sin que nadie
 * se enterara: el fierro reinició, la app no se relevantó y no había nada
 * mirando desde afuera. "Nunca se cae" son dos cosas: que vuelva sola y que
 * nos enteremos primero. Esto es lo segundo (y un empujón para lo primero).
 */

export interface DomainProbe {
  sandboxId: string;
  name: string | null;
  domain: string;
  status?: number;
  ok: boolean;
  error?: string;
  /** Qué se hizo si estaba caído. */
  action?: "restarted" | "restart_failed" | "no_runspec";
  detail?: string;
}

/** Caído = no conecta, o el proxy dice que nadie escucha detrás (502/503/504). */
function isDown(status: number | undefined, error: string | undefined) {
  if (error) return true;
  return status === 502 || status === 503 || status === 504;
}

export async function probeDomain(domain: string, timeoutMs = 15_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://${domain}/`, {
      method: "GET",
      redirect: "manual",
      signal: ctl.signal,
      headers: { "user-agent": "easybits-hosting-monitor/1" },
    });
    return { status: r.status, error: undefined };
  } catch (e: any) {
    return { status: undefined, error: String(e?.cause?.code ?? e?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

/** Contexto del DUEÑO de la caja: `restartMachine` exige serlo. */
async function ownerContext(ownerId: string): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  if (!user) return null;
  return { user, scopes: ["READ", "WRITE", "DELETE", "ADMIN"] };
}

export async function checkHostedDomains(opts: { heal?: boolean } = {}): Promise<{
  probed: DomainProbe[];
  down: DomainProbe[];
}> {
  const heal = opts.heal ?? true;
  // Cajas vendidas y vivas: una suspendida a propósito no es una caída.
  const rows = await db.sandbox.findMany({
    // "provisioning" también: hay filas que se quedaron ahí con la caja ya
    // sirviendo (normi035, réplica -r1). Lo que decide es el host.
    where: { persistent: true, status: { in: ["running", "provisioning"] } },
    select: { sandboxId: true, ownerId: true, name: true, runspec: true },
  });
  const probed: DomainProbe[] = [];
  for (const row of rows) {
    let md: Record<string, string> = {};
    try {
      const sb = await callHost<SandboxRecord>("GET", `/v1/sandbox/${row.sandboxId}`, undefined, row.ownerId);
      md = sb.metadata ?? {};
    } catch {
      continue; // sin fila en el host no hay dominio que sondear
    }
    const domains = Object.keys(md)
      .filter((k) => k.startsWith("domain:"))
      .map((k) => k.slice("domain:".length));
    for (const domain of domains) {
      const { status, error } = await probeDomain(domain);
      const p: DomainProbe = { sandboxId: row.sandboxId, name: row.name, domain, status, error, ok: !isDown(status, error) };
      probed.push(p);
    }
  }

  const down = probed.filter((p) => !p.ok);
  if (heal) {
    // Una caja con varios dominios se reinicia una sola vez.
    const seen = new Set<string>();
    for (const p of down) {
      if (seen.has(p.sandboxId)) continue;
      seen.add(p.sandboxId);
      const row = rows.find((r) => r.sandboxId === p.sandboxId)!;
      const spec = (row.runspec as Runspec | null) ?? null;
      if (!spec?.startCommand && !spec?.unit) {
        p.action = "no_runspec";
        continue;
      }
      try {
        const ctx = await ownerContext(row.ownerId);
        if (!ctx) throw new Error("owner not found");
        const r = await restartMachine(ctx, row.sandboxId);
        p.action = r.ok ? "restarted" : "restart_failed";
        p.detail = (r.startOutput ?? "").slice(-400);
      } catch (e: any) {
        p.action = "restart_failed";
        p.detail = String(e?.message ?? e).slice(0, 400);
      }
      for (const q of down) if (q.sandboxId === p.sandboxId && q !== p) { q.action = p.action; q.detail = p.detail; }
    }
    // Segunda sonda tras el reinicio: el correo dice si YA volvió.
    for (const p of down) {
      if (p.action !== "restarted") continue;
      const { status, error } = await probeDomain(p.domain);
      p.status = status;
      p.error = error;
      p.ok = !isDown(status, error);
    }
  }
  return { probed, down };
}

export async function notifyHostingIncidents(down: DomainProbe[]) {
  if (!down.length) return { sent: false };
  const to = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return { sent: false };
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const rowsHtml = down
    .map((p) => {
      const estado = p.ok ? "✅ volvió sola tras reiniciar" : `❌ sigue caída (${p.status ?? p.error})`;
      const accion =
        p.action === "restarted"
          ? "reiniciada"
          : p.action === "restart_failed"
            ? `reinicio FALLÓ: ${esc(p.detail)}`
            : p.action === "no_runspec"
              ? "sin runspec, no se pudo reiniciar"
              : "";
      return `<li><b>${esc(p.domain)}</b> (${esc(p.name ?? p.sandboxId)}) — ${estado}. ${esc(accion)}</li>`;
    })
    .join("");
  const stillDown = down.filter((p) => !p.ok).length;
  const subject = stillDown
    ? `🚨 ${stillDown} sitio(s) de hosting CAÍDO(S)`
    : `⚠️ ${down.length} sitio(s) de hosting se cayeron y volvieron solos`;
  try {
    await sendTransactional({ to, subject, html: `<p>Monitor de hosting (${new Date().toISOString()}):</p><ul>${rowsHtml}</ul>` });
    return { sent: true };
  } catch (e: any) {
    // El aviso es secundario: la sanación ya ocurrió. Que quede en el log.
    console.error("[check-hosting] no se pudo enviar el aviso:", String(e?.message ?? e).slice(0, 200));
    return { sent: false };
  }
}
