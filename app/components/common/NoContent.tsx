// Respuesta vacía para rutas que no servimos.
//
// Antes era `export const loader = () => null`, que React Router serializa como un 200
// con el cuerpo `null`. Para un navegador da igual, pero un agente que sondea
// `/.well-known/ai-plugin.json` recibía una respuesta "exitosa" y podía tomarla por
// válida. Un 404 sin cuerpo silencia igual el ruido y dice la verdad.
export const loader = () => new Response(null, { status: 404 });
