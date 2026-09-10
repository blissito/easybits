// GET /.well-known/mcp-registry-auth — prueba de dominio para el MCP Registry oficial.
//
// El registry firma la publicación de `cloud.easybits/*` contra la llave pública que sirve
// este archivo (método HTTP, equivalente al TXT en el apex del DNS). La llave PRIVADA vive
// fuera del repo; esto es solo la mitad pública, que es información abierta por diseño.
//
// 🚨 Ruta de recurso: NO agregar `export default`. Un componente aquí haría que React Router
// sirviera el shell de la SPA con status 200 y el registry leería HTML en vez de la prueba.
const PUBLIC_KEY = "jehSm7tYDTYDTNk7YMyptzz9bluJz8g9bILGgyyVvug=";

export const loader = () =>
  new Response(`v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
