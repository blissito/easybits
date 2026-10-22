# Auditoría del generador de /dash/sitios (2026-10-15)

Caso: «Start stack» (`6ad100ca62d8555448f6c266`, Gemini 3.8 Flash). 60 acciones, ~10 min, termina en
«⚠️ network error». No quedó respuesta guardada ni fila de consumo. Causa: el deploy `61fee619`
reinició la app a mitad del turno.

## Hallazgos (por gravedad)

1. **El turno vive dentro del request HTTP.** `api/v2/sites.$id.chat.ts` corre `routeMessage` dentro
   del `ReadableStream` del SSE. Si el proceso muere (deploy, `server.close` en SIGTERM no espera
   streams abiertos), se pierde todo lo del lado EasyBits: la respuesta no se persiste, `saveNarrated`
   no corre y `recordFleetTurnUsage` no registra nada. La caja del agente pudo terminar su trabajo, pero
   nadie recoge el resultado. La flota ya tiene la pieza (backend móvil: `turn.completed` + replay
   `?since=` + `gap`); Sitios no la usa.
   → Arreglo: el turno arranca desacoplado (id de turno en DB, estado `running`) y el SSE sólo se
   suscribe. Al recargar, el editor se re-engancha. En SIGTERM, drenar los turnos de Sitios como ya se
   hace con baileys (o marcar `interrumpido` y ofrecer «Continuar» en un clic).

2. **El error borra lo que ya se vio.** En `editor.tsx` `send()`, tanto `catch` como `e.type === "error"`
   hacen `text: "⚠️ …"`: reemplazan 60 acciones de narración por una línea. Debe AÑADIR el aviso al final.

3. **Recargar no sabe que hay un turno en curso.** `busy` es estado local: tras recargar el input queda
   libre y se puede mandar un segundo mensaje encima del primero; tampoco se ve el avance.

4. **Todo es secuencial.** Un agente, una herramienta por vuelta de modelo (~20–40 s con Gemini). 15
   archivos + lecturas/revisiones = 8–10 min. El prompt pide «esqueleto primero» pero nada en paralelo.
   → Barato: pedir en `siteTurnPrompt` que escriba los archivos nuevos en UNA vuelta (llamadas
   paralelas; Gemini y Claude las soportan) o con `sandbox_apply_patch` multi-archivo.
   → Medio: plan → N escrituras en paralelo, como `generateDocumentParallel` en Documents.

5. **Consumo ciego en turnos cortados.** `recordFleetTurnUsage` sólo corre en éxito. En un motor medido,
   un turno de 60 acciones que se corta no descuenta ni deja rastro (fuga de margen y de detección de
   abuso). Registrar lo parcial en el `finally`/`catch`.

6. **El texto de narración no persiste herramientas.** Al recargar sólo queda la respuesta; el contador
   «60 acciones · 10 lecturas» existe sólo en vivo. Menor, pero hace que un turno cortado se vea vacío.

## Sin hallazgo
- Heartbeat SSE cada 15 s: correcto para el cold spawn.
- Selección duplicada en texto + system append: intencional (sesión caliente no recibe el append).

## Orden sugerido
2 y 3 (minutos, sólo cliente) → 5 (pequeño) → 1 (el de fondo) → 4.
