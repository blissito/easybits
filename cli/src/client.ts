import { EasybitsClient, readRcConfig, resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Ctx } from "./types.js";
import { notLoggedIn } from "./errors.js";

/**
 * Precedencia de la credencial: env EASYBITS_API_KEY > --token > ~/.easybitsrc.
 * El env gana para que un agente con la variable puesta nunca opere con la key
 * de otra persona que quedó en el rc de la máquina.
 */
export async function resolveKey(ctx: Ctx): Promise<string | undefined> {
  return process.env.EASYBITS_API_KEY || ctx.token || (await readRcConfig()).apiKey;
}

export async function getClient(ctx: Ctx): Promise<EasybitsClient> {
  const apiKey = await resolveKey(ctx);
  if (!apiKey) throw notLoggedIn();
  return new EasybitsClient({ apiKey, baseUrl: await resolveBaseUrl() });
}
