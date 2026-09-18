// IPs públicas de la app `easybits` en Fly (fly ips list -a easybits).
// El apex de un dominio no puede ser CNAME: el usuario apunta A/AAAA aquí.
export const FLY_EDGE_IPS = {
  v4: "66.241.125.82",
  v6: "2a09:8280:1::5c:8bf9:0",
  cnameTarget: "easybits.fly.dev",
} as const;
