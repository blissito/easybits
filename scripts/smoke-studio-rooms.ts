import { db } from "../app/.server/db";
import {
  spawnStudio,
  getCallStatus,
  roomHasParticipants,
  destroyCall,
} from "../app/.server/core/studioOperations";
import type { AuthContext } from "../app/.server/apiAuth";

// Smoke en vivo del fix "no muere si hay llamada" + rooms[] seeding.
//   npx vite-node scripts/smoke-studio-rooms.ts spawn   → levanta caja, imprime URL + fila
//   npx vite-node scripts/smoke-studio-rooms.ts check <sandboxId>  → detección activa (recording|participants)
//   npx vite-node scripts/smoke-studio-rooms.ts destroy <sandboxId> → limpia (no dejar caja pagada viva)
const EMAIL = "fixtergeek@gmail.com";

async function ctxFor(): Promise<AuthContext> {
  const user = await db.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error(`user ${EMAIL} not found`);
  return { user, scopes: ["READ", "WRITE", "DELETE"] } as AuthContext;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const ctx = await ctxFor();

  if (cmd === "spawn") {
    console.log("spawning studio box…");
    const res = await spawnStudio(ctx);
    console.log("spawned:", JSON.stringify(res, null, 2));
    const row = await db.studioBox.findUnique({ where: { sandboxId: res.sandboxId } });
    console.log("StudioBox row:", JSON.stringify(row, null, 2));
    console.log("\n→ JOIN URL:", res.roomUrl);
    console.log("→ rooms seeded:", JSON.stringify(row?.rooms), row?.rooms?.includes(res.room) ? "✅" : "❌");
    return;
  }

  if (cmd === "check") {
    if (!arg) throw new Error("usage: check <sandboxId>");
    const row = await db.studioBox.findUnique({ where: { sandboxId: arg } });
    const st = await getCallStatus(ctx, arg);
    let active = st.recording;
    const perRoom: Record<string, boolean> = {};
    for (const r of row?.rooms ?? []) {
      const has = await roomHasParticipants(ctx, arg, r);
      perRoom[r] = has;
      if (has) active = true;
    }
    console.log("recording:", st.recording);
    console.log("rooms:", JSON.stringify(row?.rooms));
    console.log("per-room hasParticipants:", JSON.stringify(perRoom, null, 2));
    console.log("→ ACTIVE (reaper la protegería):", active ? "✅ SÍ" : "no");
    return;
  }

  if (cmd === "destroy") {
    if (!arg) throw new Error("usage: destroy <sandboxId>");
    await destroyCall(ctx, arg);
    console.log("destroyed", arg, "✅");
    return;
  }

  console.log("usage: spawn | check <sandboxId> | destroy <sandboxId>");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
