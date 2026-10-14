// A dónde apunta un cliente su dominio (desde 2026-10-08 EasyBits vive en el fierro A de
// sandbox-host, ya no en Fly). El apex no puede ser CNAME: va A a la IP del fierro. Sin IPv6:
// el fierro no publica AAAA. El nombre del export se queda por compatibilidad.
export const FLY_EDGE_IPS = {
  v4: "54.38.94.14",
  v6: null as string | null,
  cnameTarget: "cname.sandboxes.easybits.cloud",
} as const;
