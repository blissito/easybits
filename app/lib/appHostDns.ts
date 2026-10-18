// A dónde apunta un cliente su dominio: EasyBits vive en la caja app-host del fierro A de
// sandbox-host (desde 2026-10-08; antes en Fly). El apex no puede ser CNAME, va A a la IP del
// fierro. Sin IPv6: el fierro no publica AAAA. Seguro para el cliente (sólo constantes).
export const APP_HOST_DNS = {
  v4: "54.38.94.14",
  cnameTarget: "cname.sandboxes.easybits.cloud",
} as const;
