// Secretos que crea la plataforma (no el usuario): tokens de la flota, llaves de los copilotos,
// ganchos de deploy y los acotados a un cron o máquina. No se ofrecen en los selectores.
const INTERNAL = [
  /__[CM]_/,
  /^FLEET_WORKER_(ADMIN_)?TOKEN_/,
  /^DEPLOY_HOOK_/,
  /^EASYBITS_(ADMIN|CRONS)_COPILOT_KEY$/,
];

export const isInternalSecretName = (name: string) => INTERNAL.some((re) => re.test(name));
