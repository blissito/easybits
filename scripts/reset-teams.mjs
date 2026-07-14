#!/usr/bin/env node
// Reset del onboarding de un team GTeams (teams.formmy.app) para re-probar el wizard.
//
// NO toca tu cuenta Formmy ni EasyBits. Solo:
//   1) borra las llaves del wizard en el gc_config del team (sqld):
//        paso 2 → fleet_agent_id, fleet_token, fleet_name
//        paso 1 → eb_connected, eb_access_token, eb_refresh_token   (solo con --full)
//   2) (SOLO con --delete-agent) borra el @ghosty que ESE team apunta
//        (fleet_agent_id) + sus VMs/rutas, vía POST /api/v2/fleet-agents/:id/delete
//        (auth = el propio fleet_token). Nunca toca otro agente: solo el wired.
//        Por DEFAULT NO borra ningún agente — solo limpia la config, así el wizard
//        re-pregunta en paso 2 y el agente queda intacto (reusable en /dash/flota).
//
// El gc_config vive en la EasyBits DB (sqld) del team; se edita por el endpoint
// público /api/v2/databases/:id/query. Para autenticar minteamos una API key
// temporal de fixtergeek y la revocamos al terminar (no toca tus keys existentes).
//
// Uso:
//   node scripts/reset-teams.mjs                 # limpia config → wizard paso 2 (agente intacto)
//   node scripts/reset-teams.mjs --full          # además desconecta EasyBits (paso 1)
//   node scripts/reset-teams.mjs --delete-agent  # además borra el @ghosty wired + sus VMs
//   node scripts/reset-teams.mjs --team ghosty-teams-fixtergeek --email fixtergeek@gmail.com
//   node scripts/reset-teams.mjs --dry           # muestra qué haría, sin escribir
//
// Requiere DATABASE_URL en el entorno (lo toma de .env como el resto del repo).

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const EMAIL = opt("--email", "fixtergeek@gmail.com");
const TEAM = opt("--team", "ghosty-teams-fixtergeek"); // nombre o id de la Database del team
const BASE = process.env.EASYBITS_BASE_URL ?? "https://www.easybits.cloud";
const FULL = flag("--full");
const DELETE_AGENT = flag("--delete-agent"); // por default NO se borra el agente
const DRY = flag("--dry");

const STEP2_KEYS = ["fleet_agent_id", "fleet_token", "fleet_name"];
const STEP1_KEYS = ["eb_connected", "eb_access_token", "eb_refresh_token"];
const WIPE_KEYS = FULL ? [...STEP2_KEYS, ...STEP1_KEYS] : STEP2_KEYS;

const db = new PrismaClient();
const log = (...a) => console.log(...a);
const die = (m) => { console.error("✗", m); process.exit(1); };

// ── query al gc_config del team vía endpoint público (bearer = key temporal) ──
async function dbq(dbId, key, sql, sqlArgs = []) {
  const res = await fetch(`${BASE}/api/v2/databases/${dbId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ sql, args: sqlArgs }),
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1) Usuario + Database del team.
  const user = await db.user.findFirst({ where: { email: EMAIL }, select: { id: true, email: true } });
  if (!user) die(`usuario ${EMAIL} no encontrado`);
  const isObjId = /^[0-9a-fA-F]{24}$/.test(TEAM);
  const team = await db.database.findFirst({
    where: {
      userId: user.id,
      OR: [{ name: TEAM }, { namespace: TEAM }, ...(isObjId ? [{ id: TEAM }] : [])],
    },
    select: { id: true, name: true, namespace: true },
  });
  if (!team) die(`team "${TEAM}" no encontrado para ${EMAIL} (usa --team con el nombre exacto)`);
  log(`▸ team: ${team.name} (db ${team.id})`);
  log(`▸ modo: ${FULL ? "FULL (paso 1 — reconecta EasyBits)" : "paso 2 (mantiene OAuth)"}${DELETE_AGENT ? " · BORRA agente wired" : " · agente intacto"}${DRY ? " · DRY-RUN" : ""}`);

  // 2) Key temporal (WRITE/DELETE) para hablar con el gc_config. Se revoca al final.
  const raw = `eb_sk_live_${nanoid(32)}`;
  const tmp = DRY ? null : await db.apiKey.create({
    data: {
      name: `reset-teams tmp ${new Date().toISOString()}`,
      hashedKey: createHash("sha256").update(raw).digest("hex"),
      prefix: raw.slice(0, 19),
      scopes: ["READ", "WRITE", "DELETE"],
      userId: user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min de gracia
    },
    select: { id: true },
  });

  try {
    // 3) Estado actual del wizard.
    const readKey = DRY ? null : raw;
    let fleetAgentId = null, fleetToken = null;
    if (!DRY) {
      const q = await dbq(team.id, readKey,
        `SELECT k, v FROM gc_config WHERE k IN (${[...STEP2_KEYS, ...STEP1_KEYS].map(() => "?").join(",")})`,
        [...STEP2_KEYS, ...STEP1_KEYS]);
      const rows = q?.rows ?? q?.result?.rows ?? [];
      const cur = {};
      for (const r of rows) cur[r[0] ?? r.k] = r[1] ?? r.v;
      fleetAgentId = cur.fleet_agent_id ?? null;
      fleetToken = cur.fleet_token ?? null;
      log(`▸ estado: connected=${cur.eb_connected === "1"} · agent=${fleetAgentId ?? "—"} (${cur.fleet_name ?? "—"})`);
    } else {
      log("▸ (dry) omito lectura de gc_config");
    }

    // 4) Borrar el @ghosty wired (solo ese) + sus VMs — SOLO con --delete-agent.
    if (DELETE_AGENT && fleetAgentId) {
      const fa = await db.fleetAgent.findUnique({
        where: { id: fleetAgentId },
        select: { id: true, ownerId: true, assistantName: true, workerTemplate: true, token: true, createdAt: true },
      });
      if (!fa) {
        log(`  · agente ${fleetAgentId} ya no existe en Mongo — skip`);
      } else if (fa.ownerId !== user.id) {
        log(`  ⚠ agente ${fleetAgentId} NO es de ${EMAIL} (owner=${fa.ownerId}) — NO lo borro`);
      } else {
        log(`  · borrando @ghosty ${fa.assistantName ?? ""} [${fa.workerTemplate}] creado ${fa.createdAt.toISOString().slice(0, 10)}`);
        if (!DRY) {
          const res = await fetch(`${BASE}/api/v2/fleet-agents/${fleetAgentId}/delete`, {
            method: "POST",
            headers: { Authorization: `Bearer ${fleetToken ?? fa.token}` },
          });
          if (!res.ok) throw new Error(`delete fleet ${res.status}: ${await res.text()}`);
          log(`    ✓ ${JSON.stringify(await res.json())}`);
        }
      }
    } else if (DELETE_AGENT) {
      log("  · sin agente wired — nada que borrar");
    } else if (fleetAgentId) {
      log(`  · agente wired ${fleetAgentId} INTACTO (usa --delete-agent para borrarlo)`);
    }

    // 5) Limpiar las llaves del wizard.
    log(`▸ wipe gc_config: ${WIPE_KEYS.join(", ")}`);
    if (!DRY) {
      await dbq(team.id, raw,
        `DELETE FROM gc_config WHERE k IN (${WIPE_KEYS.map(() => "?").join(",")})`,
        WIPE_KEYS);
    }

    log(`\n✓ Team reseteado → el wizard arranca en ${FULL ? "paso 1 (Conecta EasyBits)" : "paso 2 (Elige/Crea tu Ghosty)"}.`);
    log(`  Abre teams.formmy.app${DRY ? "  (era DRY-RUN, no se escribió nada)" : " y recarga /setup"}.`);
  } finally {
    // 6) Revocar la key temporal.
    if (tmp) await db.apiKey.update({ where: { id: tmp.id }, data: { status: "REVOKED", revokedAt: new Date() } }).catch(() => {});
    await db.$disconnect();
  }
}

main().catch(async (e) => { console.error("✗", e.message); await db.$disconnect(); process.exit(1); });
