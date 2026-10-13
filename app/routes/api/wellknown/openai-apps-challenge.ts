// GET /.well-known/openai-apps-challenge — verificación de dominio del directorio de apps de
// ChatGPT. OpenAI da un token en su portal; se carga como OPENAI_APPS_CHALLENGE (secreto de
// Fly) y aquí se sirve tal cual, en texto plano. Sin la variable, 404.
//
// 🚨 Ruta de recurso: NO agregar `export default` (serviría el shell HTML con 200).
export const loader = () => {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not found\n", { status: 404 });
  return new Response(token, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
};
