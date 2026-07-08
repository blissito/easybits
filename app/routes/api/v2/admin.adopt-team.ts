import type { Route } from "./+types/admin.adopt-team";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { tryVerifyOAuthJwt } from "~/.server/oauth";
import { db } from "~/.server/db";
import { getUserPlan, PLANS } from "~/lib/plans";
import { DB_LIMITS } from "~/.server/core/databaseOperations";
import { createApiKey } from "~/.server/iam";
import { getReservedCapacity } from "~/.server/core/sandboxReservations";
import { reassignSandboxOwnerHost, countOwnerHostSandboxes, execCommand } from "~/.server/core/sandboxOperations";

// POST /api/v2/admin/adopt-team — "adopción formal": transfiere la DB del team y
// su caja de la cuenta de PLATAFORMA a la cuenta del USER que conectó su EasyBits.
// Auth = ADMIN (la platform key). `targetUserToken` = el JWT OAuth del user, que
// prueba SU consentimiento y resuelve su userId. Respeta tiers/cupo.
//
// Orden retry-safe: mint key durable del user → re-keyea el env de la caja + restart
// (revive con la key del user) → reasigna owner del host → reasigna Database.userId.
// El swap de credencial es OBLIGATORIO: queryDatabase 404ea sin ownership match, así
// que la key vieja de plataforma dejaría de poder operar la DB tras reasignarla.
const json = (b: unknown, status = 200) => Response.json(b, { status });

export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "ADMIN");

  const body = (await request.json().catch(() => ({}))) as {
    targetUserToken?: string; dbId?: string; sandboxId?: string;
  };
  const targetUserToken = String(body.targetUserToken ?? "");
  const dbId = String(body.dbId ?? "");
  const sandboxId = String(body.sandboxId ?? "");
  if (!targetUserToken || !dbId) return json({ error: "targetUserToken y dbId requeridos" }, 400);

  // Consentimiento + identidad: el token OAuth del user que adopta prueba que ES él.
  const target = await tryVerifyOAuthJwt(targetUserToken);
  if (!target) return json({ error: "targetUserToken inválido o expirado" }, 401);

  const database = await db.database.findUnique({ where: { id: dbId } });
  if (!database) return json({ error: "database no encontrada" }, 404);

  const alreadyOwned = database.userId === target.id;
  const plan = getUserPlan(target);

  // Gates de tier — solo si aún hay que transferir. Falla limpio con "upgrade"; la
  // caja se queda funcional bajo plataforma (no se rompe nada).
  if (!alreadyOwned) {
    const dbCount = await db.database.count({ where: { userId: target.id } });
    if (dbCount >= DB_LIMITS[plan]) {
      return json({ error: "db_quota", message: `Tu plan ${plan} permite ${DB_LIMITS[plan]} bases de datos. Actualiza para adoptar este espacio.`, plan }, 402);
    }
    if (sandboxId) {
      const reserved = await getReservedCapacity(target.id);
      const budget = PLANS[plan].concurrentSandboxes + reserved.machines;
      const owned = await countOwnerHostSandboxes(target.id);
      if (owned >= budget) {
        return json({ error: "sandbox_quota", message: `Tu plan ${plan} permite ${budget} caja(s) activa(s). Actualiza para adoptar este espacio.`, plan }, 402);
      }
    }
  }

  // Credencial operativa durable del user (scoped, NO admin) = la nueva identidad de
  // la caja para DB y files. Reemplaza la platform key en /app/secrets.env.
  const key = await createApiKey(target.id, { name: `ghosty-teams:${database.name}`, scopes: ["READ", "WRITE", "DELETE"] });

  // Nombre destino (colisión (userId,name) → sufijo). El namespace/datos NO cambian.
  let name = database.name;
  if (!alreadyOwned) {
    const clash = await db.database.findUnique({ where: { userId_name: { userId: target.id, name } } });
    if (clash) name = `${name}-${dbId.slice(0, 6)}`;
  }

  // TRANSACCIONAL: reasigna DB + owner del host, luego re-keyea la caja + restart.
  // Si el rekey/restart falla, ROLLBACK de la DB a plataforma → el box nunca queda
  // roto (sigue operando con la platform key). El restart mata el proceso que llamó
  // (setup.ts), por eso el disparo es fire-and-forget; este endpoint completa igual.
  const prevOwner = database.userId;
  if (!alreadyOwned) {
    await db.database.update({ where: { id: dbId }, data: { userId: target.id, name } });
  }
  if (sandboxId) {
    try {
      await reassignSandboxOwnerHost(sandboxId, target.id);
      const safeKey = key.raw.replace(/[^A-Za-z0-9_-]/g, "");
      const safeOwner = target.id.replace(/[^A-Za-z0-9]/g, "");
      const cmd = [
        "set -e",
        'f=/app/secrets.env',
        'touch "$f"',
        `grep -vE '^(EASYBITS_API_KEY|EASYBITS_OWNER)=' "$f" > "$f.new" || true`,
        `printf 'EASYBITS_API_KEY=%s\\nEASYBITS_OWNER=%s\\n' '${safeKey}' '${safeOwner}' >> "$f.new"`,
        'mv "$f.new" "$f"',
        "touch /app/.eb_adopted",
        "systemctl restart ghosty-chat",
        "sleep 2 && systemctl is-active ghosty-chat",
      ].join("\n");
      const res = await execCommand(ctx, sandboxId, { command: cmd, timeoutSeconds: 90 });
      if (!String((res as { output?: string })?.output ?? "").includes("active")) {
        throw new Error("ghosty-chat no volvió active tras el restart");
      }
    } catch (e) {
      // Rollback: devuelve la DB + el owner a plataforma → box vuelve a operar.
      if (!alreadyOwned) await db.database.update({ where: { id: dbId }, data: { userId: prevOwner, name: database.name } }).catch(() => {});
      await reassignSandboxOwnerHost(sandboxId, prevOwner).catch(() => {});
      return json({ error: "adopt_failed", message: e instanceof Error ? e.message : String(e), rolledBack: true }, 502);
    }
  }

  return json({ ok: true, ebUserId: target.id, dbName: name, already: alreadyOwned || undefined, keyPrefix: key.prefix });
}
