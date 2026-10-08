// GET /api/version — SHA del build. Sin efectos laterales (a diferencia de /api/health,
// que relevanta los sockets de WhatsApp): sirve para confirmar un rollout desde fuera.
export function loader() {
  return new Response(process.env.GIT_SHA || "dev", {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
