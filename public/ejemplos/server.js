// server.js — un servidor mínimo para correr dentro de tu sandbox de EasyBits.
// No necesita dependencias: usa el módulo http que ya trae Node.
const http = require("http");

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      mensaje: "¡Hola desde tu sandbox de EasyBits!",
      ruta: req.url,
      hora: new Date().toISOString(),
    })
  );
});

// Escucha en el puerto 3000 — el mismo que vamos a exponer con exposePort(3000).
server.listen(3000, () => {
  console.log("Servidor escuchando en el puerto 3000");
});
