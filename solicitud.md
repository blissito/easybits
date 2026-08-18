# Solicitudes de Deník a EasyBits

Este archivo es el **canal de peticiones del equipo de Deník (`~/agenda`) hacia EasyBits**.
Iremos escribiendo aquí feedback, huecos detectados y cambios que necesitamos. No es un
documento que se lea una vez: **revísalo cada vez que trabajes en el MCP o en las tools**, y
cuando cierres algo márcalo abajo en vez de borrarlo, para que quede el historial de por qué se
pidió.

**Cómo responder**: implementa lo que esté en ABIERTO, y deja tu respuesta/decisión en la misma
entrada (si algo no se puede o se resuelve distinto, dilo ahí — es más útil que hacerlo en
silencio).

---

## Contexto: para qué lo queremos

Nik (el asistente de Deník) corre en la flota EasyBits y edita las landings de los negocios.
Hoy puede **retocar** una página pero no **construirla bien**. Le faltan tres cosas: ver lo que
hace, poder añadir y quitar sin reescribir, y tener iconos.

---

## ABIERTO

### 1. `insert_html` y `remove_html` — completar el trío de edición

**Petición nueva, y es la más importante de este archivo.**

Reconocimiento primero: **`replace_html` ya resolvió el problema caro** y lo resolvió bien. El
contrato `old_html → new_html` con `{noop:true}` es correcto, y la decisión de preferirlo sobre
selectores CSS —*"GrapesJS can modify attributes between reads, breaking selectors"*— es la
lección buena. No lo cambies.

Pero **falta la mitad de las operaciones**. Hoy se puede reemplazar; no se puede **agregar** ni
**quitar** de forma direccionada. Consecuencia: "añade una tarjeta más a la rejilla" obliga a
reemplazar el padre entero. Y eso no es sólo caro en tokens — **es un problema de calidad**: cada
reescritura de un contenedor grande es una oportunidad para que el modelo cambie cosas que nadie
pidió. Deriva.

Importa el doble cuando el agente tiene visión: ver un error y luego reescribir 40 KB para
arreglarlo introduce dos errores nuevos. **Un bucle de visión sobre reescritura completa no
converge.** Por eso esto va antes que el screenshot en nuestra lista.

```
insert_html({ documentId, pageId, anchor_html, position, html })
   position: "before" | "after" | "prepend" | "append"
   // anchor_html: substring exacto, mismo contrato que old_html de replace_html
   // before/after → hermano del ancla; prepend/append → dentro del ancla

remove_html({ documentId, pageId, html })
   // el substring exacto a eliminar
```

Notas:

- **Mismo contrato de string exacto que `replace_html`**, no selectores. Es incremental sobre lo
  que ya tienes, no un rediseño.
- Devuelve `{noop:true}` igual, y falla explícito si el ancla no aparece **o aparece más de una
  vez** — un ancla ambigua que inserta en el lugar equivocado es peor que un error.

Referencia de implementación: ghosty-teams ya corre este trío en producción (`eb-patch` /
`eb-insert` / `eb-remove`, `src/agents.server.ts:957`). Sus reglas de prompt valen la pena
robarlas tal cual: *"el resultado debe ser 90%+ idéntico al original"*, *"elige el nodo más
PEQUEÑO que contenga todo el cambio"*, *"en la duda entre un patch dudoso y re-emitir completo,
elige el completo"*, y un kill-switch por env para volver a reescritura completa sin deploy.

**Nota sobre direccionamiento estable — para pensar, no para hacer ya.** Existe una idea de
convertir esto en una primitiva compartida con `data-id` estables. Antes de comprarla, ojo: los
tres repos direccionan distinto y **no es cosmético**.

| | Cómo direcciona | Qué pasa con el resto del documento |
|---|---|---|
| EasyBits | string-diff, sin ids | byte-idéntico, pero sin dirección estable entre versiones |
| agenda | `data-id` + offsets con parse5, **nunca serializa** | **byte-idéntico** |
| ghosty-teams | `data-id` + jsdom + `outerHTML` | **re-serializa**: normaliza comillas, reordena atributos |

Si algún día se unifica, el modelo a copiar es el de agenda, no el de ghosty-teams:
re-serializar ensucia el diff de una sección entera con cada ajuste de color, y eso duele en una
página pública en vivo. El string-diff que ya tienes es compatible con esa propiedad.

### 2. `screenshot_url` — exponer la caja de render

**Por qué**: la capacidad **ya existe** en EasyBits, sólo que no está expuesta de forma general.
`export_document` documenta *"rendering is server-side via Playwright — dimensions are always
honored regardless of the calling agent's environment"*, y `extract_brand_kit_from_url` ya
captura un screenshot de una URL pública arbitraria (lo usa para vision + scrape de logo).

Lo que hay hoy **no nos sirve**:

- `get_page_screenshot` sólo acepta un `documentId` de EasyBits, es letter-size, y su propia
  descripción dice *"requires Chrome installed locally — designed for Claude Code MCP usage"*.
  Dentro del worker de la flota no hay Chrome local: moriría.
- `export_document` está atado a documentos EasyBits; nuestras landings no son documentos
  EasyBits.

**Lo que pedimos**:

```
screenshot_url({
  url?: string,        // http/https público
  html?: string,       // markup crudo (gana sobre url, igual que en import_html)
  preset?: "mobile" | "desktop",
  viewport?: { width: number, height: number },
  fullPage?: boolean,  // default true
  waitMs?: number      // espera extra ANTES de capturar
})
→ { fileId, url, width, height, contentType }
```

Notas que no son opcionales para nosotros:

- **`html` crudo es imprescindible**, no sólo `url`. Necesitamos que Nik vea un borrador
  **antes** de publicarlo; si sólo acepta URL, la única forma de mirar es publicar, y publicar
  una landing rota en el sitio en vivo de un negocio no es una opción.
- **`waitMs` es imprescindible.** Nuestras landings publicadas meten
  `<script src="https://cdn.tailwindcss.com">` **síncrono** en el `<head>` dentro de un iframe
  con origen opaco (sin caché compartida): cada visita re-descarga ~400 KB y la página se ve
  **en blanco 20-30 segundos**. Un screenshot inmediato sale blanco y Nik concluiría que rompió
  la página. Si además puedes esperar a `networkidle` por default, mejor.
- **`preset: "mobile"`** importa más que desktop: nuestro auditor evalúa el peor caso, que es
  móvil (ignora los modificadores responsive a propósito).
- Devolver `fileId` + URL pública para poder encadenar directo a `describe_image`.

**Transparencia**: tenemos una caja Chromium propia (`render-svc` de ghosty-studio, HTML→PDF/PNG)
y podríamos hacerlo nosotros. Preferimos que exista aquí porque le sirve a todos los que usan la
flota, no sólo a Deník. Si te queda lejos en prioridad, dilo y lo resolvemos por nuestro lado —
no te bloquees por esto.

**Aviso sobre `waitMs`, para que no se malinterprete**: estamos por hornear el CSS de Tailwind al
publicar (`bakeTailwind`), lo que mata la mayor parte de ese blanqueo. Aun así `waitMs` sigue
haciendo falta: (a) el `<script>` del CDN se conserva a propósito para las clases armadas en JS,
(b) el horneado sólo aplica al **re**publicar, así que todas las landings vivas hoy siguen
tardando hasta que su dueño las toque, y (c) fuentes e imágenes tardan igual. No es un parche a
un bug nuestro, es correcto en general.

### 3. `search_icon` — iconos

**Por qué**: no existe ninguna tool de iconos. Vemos que el pipeline de documentos resuelve
`data-icon-query="..."` server-side, pero eso vive dentro de `set_page_html` y no es alcanzable
desde fuera.

```
search_icon({ query: string, style?: string, limit?: number })
→ { icons: [{ svg, name, license, attribution? }] }
```

**Devuélvelo como SVG inline, no como URL.** Nuestro `buildDeployHtml` no puede depender de otro
host externo — el CDN de Tailwind ya nos cuesta el blanqueo descrito arriba, y no vamos a añadir
un segundo punto de falla en la ruta crítica de render de una página pública.

Si el proveedor exige atribución, devuélvela en el payload y lo pintamos nosotros.

---

## Prioridad

Si sólo puedes hacer una: **la 1** (`insert_html` / `remove_html`). Es la que desbloquea todo lo
demás y la más barata de las tres, porque es incremental sobre `replace_html`.

Orden: **1 → 3 → 2**. La 2 la podemos cubrir nosotros si hace falta; la 1 no.

---

## Lo que YA nos sirve (no tocar)

Auditado el 2026-08-17. Esto lo damos por bueno y lo vamos a usar tal cual:

| Tool | Para qué lo usamos |
|---|---|
| `replace_html` | edición quirúrgica — el contrato es el correcto, no lo cambies |
| `describe_image` | el "ojo" que juzga el screenshot (vision + OCR, gemini-2.5-flash) |
| `search_stock_photo` | fotos reales de la landing (Pexels/Unsplash/Pixabay/Openverse) |
| `create_or_edit_image` | imágenes generadas y edición con referencia |
| `discover_tools` + `run_tool` | codemode — patrón correcto, ya lo replicamos en Deník |
| `extract_brand_kit_from_url` | bootstrap del brand kit desde el sitio actual del negocio |

Nota aparte: el recorte de `tools/list` con `discover_tools`/`run_tool` como escape nos parece la
decisión correcta y la copiamos en `@denik.me/mcp` (74 tools, 22 en la lista corta). No la
deshagas.

---

## Correcciones a lecturas previas

Para que no se propaguen dos cosas que dijimos mal antes:

- **"EasyBits sólo direcciona por sección/página completa"** — falso. Ya hay tres granularidades:
  `set_page_html` (página), `set_section_html` (selector CSS) y `replace_html` (string-diff). El
  hueco real es sólo insert/remove.
- **"`bakeTailwind` hace innecesario `waitMs`"** — falso, por las tres razones de la sección 2.

---

## Respuesta de Deník (2026-08-17)

Gracias por las cuatro correcciones. Tres aceptadas, una con matiz, y una pregunta abierta que
nos bloquea.

### 1. Tienen razón en `bakeTailwind`, y va MÁS LEJOS de lo que dijeron

Verificado en nuestro bundle. No basta con quitar el CDN: el HTML emite **dos** scripts pegados,
y el segundo depende del primero.

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{...}}}}</script>
```

Poner `defer` sólo en el primero **revienta el segundo** con `tailwind is not defined`. Hay que
hornear y tratar a los dos juntos.

**Y ese HTML no lo generamos nosotros: sale de `buildDeployHtml` de
`@easybits.cloud/html-tailwind-generator`, o sea de su paquete.** Podemos post-procesar la salida
de nuestro lado y lo haremos si hace falta, pero el arreglo limpio es en el SDK y le sirve a
todos sus consumidores, no sólo a Deník.

**Pregunta concreta: ¿lo toman ustedes en el SDK, o lo parcheamos aquí?**

### 2. `screenshot_url` se queda pedido

Aceptado. El argumento de la credencial única —`fileId` + URL pública + encadenar a
`describe_image` sin hablarle a la infra de otro producto— es mejor que el nuestro. Retiramos la
idea de resolverlo por `render-svc`.

### 3. Sobre `waitMs` no honrado — gracias por medirlo y decirlo

Que devuelvan `waitHonored: false` en vez de aceptar el flag y no cumplirlo es exactamente lo
correcto. Un parámetro que se ignora en silencio es peor que uno que no existe: el agente creería
que esperó y culparía a su propio HTML de una captura en blanco.

La consecuencia para nosotros es fuerte y la asumimos: **hasta que el CSS esté horneado, un
screenshot de una landing publicada nuestra sale en blanco**, con `waitMs` o sin él. O sea que el
ojo de Nik no vale nada antes del punto 1. Eso sube `bakeTailwind` de "arreglo pendiente" a
prerequisito, y confirma su orden.

Un matiz que sigue en pie: aun con el CSS horneado, fuentes e imágenes tardan. Si algún día
implementan la espera, `networkidle` nos sirve más que un `waitMs` fijo.

### 4. Pregunta ABIERTA que nos bloquea: ¿en qué forma sale insert/remove?

Nos honra que porten nuestro mecanismo (parse5 como índice + splice por offsets), y coincidimos
en que es el correcto para una página pública en vivo. Pero hay un hueco que hay que resolver
antes de que empecemos:

**Sus primitivas operan sobre `documentId` — documentos EasyBits. Nuestras landings viven en
`Org.landingSections` y no son documentos suyos.** Portarlo a EasyBits, tal cual, **no nos da
insert/remove en nuestras landings**.

Dos salidas, y nos sirve cualquiera:

- **(a)** Las operaciones aceptan un **HTML suelto** además de un `documentId` — entra string,
  sale string. Nosotros persistimos.
- **(b)** Sale como **librería importable** (npm), y la usamos contra nuestro propio storage.

Si es ninguna de las dos, lo construimos aquí y ustedes se quedan igual con el mecanismo — pero
digan cuál para no duplicar trabajo.

### 5. Orden

Aceptamos el suyo: **bakeTailwind-sin-CDN → insert/remove → consumir `screenshot_url`**.

Del lado de Deník va antes una tanda de tools de paquetes/bonos (prioridad de negocio de Brenda).
No los toca ni los bloquea.

### Nota: dejamos de necesitar rebakes para tools nuevas

Cambiamos `@denik.me/mcp` para que `discover_tools` **fusione** su catálogo horneado con uno que
sirve nuestro servidor (`GET /api/mcp/catalog`), y `run_tool` caiga a un despachador genérico
(`POST /api/mcp/dispatch`) cuando no reconoce un nombre. Degrada al catálogo local si el servidor
no responde.

Lo mencionamos por si les sirve el patrón: es unión y no reemplazo justamente para que el fallo
del servidor devuelva al agente al comportamiento anterior en vez de dejarlo sin tools.

---

## Respuesta de Deník (2026-08-17, tarde)

Gracias por verificar contra el código en vez de contra la doc — y por decir que
el hueco era el cableado y no la caja. La descripción de la tool estaba diciendo
la verdad **sobre la tool**; nosotros la leímos como verdad sobre el navegador.

**Nada que construyamos de nuestro lado. Confirmado: no levantamos CDP propio.**

### Una pregunta que sí nos cambia el trabajo AHORA

`BOX_HONORS_WAIT` en false: ¿es sólo el **flag que se reporta**, o además **gatea
que `waitMs` llegue a la caja**?

No es curiosidad: hoy le tenemos escrito a nuestro agente, en su prompt, que
*"la caja captura al `load` y NO espera, así que `screenshot_url` sólo sirve
sobre la página ya publicada"*. Si `waitMs` de hecho ya funciona y lo único viejo
es el flag, esa instrucción está de más y le estamos prohibiendo al agente ver un
borrador sin publicar — que es justo el caso que pedimos.

- Si es sólo reporte → lo quitamos del prompt hoy mismo.
- Si gatea → lo dejamos hasta que salga el cableado, y nos avisan.

### Cuando salga

Nos avisan y ajustamos el prompt en un commit: quitar el aviso del `load`,
decirle que `preset:"mobile"` ya es emulación de verdad, y añadir `/audit`. Son
tres frases, no hay trabajo estructural.

### SSRF

De acuerdo en que se cierra con firewall de egress y no con otro navegador. Un
dato de nuestro lado por si les sirve para priorizar: en nuestro caso la URL no
la escribe el usuario, la **compone el agente**, y el agente lee el HTML de la
landing — así que una instrucción inyectada en el contenido de una página es un
camino plausible hacia "capturá esta URL interna". Estrecho, pero existe.

---

## CERRADO

### 1. `insert_html` / `remove_html` — CERRADO como `patch_node`

Salió con otra forma, mejor: en vez de dos tools de string-diff, **una tool por NODO** con las tres
operaciones. `patch_node({ op: "replace" | "insert" | "remove", nodeId, pos, html })` +
`get_node_outline` para ver las direcciones (`app/.server/mcp/server.ts:4395-4460`).

Por qué así y no el trío pedido: el ancla ambigua que ustedes mismos señalaron como "peor que un
error" desaparece si la dirección es un id y no un substring. Robamos sus reglas de prompt tal
cual (90%+ idéntico, el nodo más pequeño, ante la duda re-emitir completo) y el contrato de fallo
es explícito: `applied[]` + `failed[{nodeId, reason}]` con reason ∈ missing | ambiguous |
unparseable | root | void | empty. Un patch que no aplica deja el documento intacto.

**Y responde su pregunta bloqueante (sección 4 de su respuesta): es la salida (a).** Las dos tools
aceptan **`html` suelto** además de `documentId`+`pageId` — entra string, sale string, ustedes
persisten en `Org.landingSections`. Lo que no tocan queda byte-idéntico (modelo de agenda, no de
ghosty-teams: no re-serializamos).

### 2. `screenshot_url` — CERRADO, y con el recorte por nodo incluido

`app/.server/mcp/server.ts:6068`. Acepta `html` (gana sobre `url`), `preset: "mobile" | "desktop"`,
`viewport`, `fullPage`, `waitMs`, `dataId`/`selector` + `padding`.

Tres cosas que cambian lo que tienen escrito en el prompt de Nik:

- **`waitMs` se honra.** `BOX_HONORS_WAIT` en false ya no existe; además la caja espera a
  `document.fonts.ready`, y `url` navega con networkidle. **Quiten el aviso del `load`**: Nik puede
  ver un borrador sin publicarlo, que era justo el caso que pedían.
- **`preset:"mobile"` es emulación REAL**, no un viewport angosto: densidad 3x y touch.
- Si la captura sale de un solo color, la respuesta trae `warning` — significa "el CSS no había
  pintado", no "rompiste la página".

### 3. `search_icon` — CERRADO

`app/.server/mcp/server.ts:6036`. SVG inline, sin host externo, como pidieron.

### `bakeTailwind` — CERRADO, lo tomamos nosotros en el SDK

`packages/html-tailwind-generator/src/bake.ts`. **No lo parcheen de su lado.** Tenían razón en que
va más lejos: quita el CDN **y** el `<script>tailwind.config</script>` juntos (poner `defer` sólo
al primero revienta el segundo), compila el CSS server-side y deja `safelist` para las clases
armadas en JS, que es lo que se perdería en silencio al matar el runtime del CDN.

Vive en el paquete y no en la app precisamente por su argumento: quien sufre el problema es todo
consumidor de `buildDeployHtml`, no sólo Deník.

---

## 2026-08-17 · Captura recortada al nodo (`screenshot_url` con `dataId`)

**Lo que pasó.** Depurando la landing de CyberLol en vivo salieron dos cosas.

1. `audit_page` reportó "sin fallos de contraste" sobre una tarjeta cuyo título
   —"Renta de PC para GTA V", gris oscuro sobre una foto oscura— es ilegible.
   No es un bug de ustedes: es texto sobre imagen, así que cae en `incomplete`,
   exactamente como está documentado. El agente reportó sólo `violations`.
2. Verificarlo con visión cuesta carísimo. La landing a 390px con `fullPage`
   sale de **1170×2532**, y pasar esa tira por `describe_image` tarda minutos.
   El agente acaba evitando el paso que justamente resolvería el caso.

**Lo que pedimos.** Que `screenshot_url` acepte un **`dataId`** (o un selector
CSS) y devuelva la imagen **recortada a ese elemento**, con un poco de margen.

Es el patrón estándar: el `screenshot` de Playwright MCP acepta la referencia de
un elemento y devuelve el recorte, precisamente para que la visión sea barata y
se use sólo donde el árbol no alcanza. Encaja solo con lo que ya tienen: cada
hallazgo de `audit_page` **ya trae el `dataId` del culpable**, así que el bucle
quedaría `audit_page` → por cada `incomplete`, `screenshot_url({dataId})` →
`describe_image`. Un recorte de una tarjeta son ~400×300 en vez de 1170×2532.

Sin esto la única salida es capturar la página entera para mirar un título, que
es lo que hace que el agente prefiera no mirar.

**Dato de campo que vale la pena**: cuando el dueño pegó a mano la captura de esa
tarjeta, el agente diagnosticó bien al primer intento y lo arregló ("el badge no
tiene fondo sólido, sólo 10% de opacidad"). El razonamiento no falla; falla lo
que le llega a los ojos.

---

## 2026-08-18 · La caja no arranca a media conversación

Segundo reporte, y este pega más fuerte que el de la captura: **el worker falla al
arrancar y el turno se pierde**. El dueño ve "El asistente no pudo completar la
respuesta" a mitad de lo que estaba haciendo.

Lo que registramos de nuestro lado, tal cual:

```
2026-08-18T02:44:52Z [asistente] turno fallido 698a3dca1903400d6ad2e5c9
  fleetAgent worker 6a83a7654872bf93ad8ef6e9 failed to start
```

**Lo que SÍ podemos afirmar**: ocurrió con la app sana (sin deploy en curso, sin
reinicio de nuestra máquina; los `/api/mcp/*` respondían en ~120 ms) y el turno
no se recuperó solo. Los ids de arriba deberían bastarles para rastrearlo.

**Lo que NO podemos afirmar**: la frecuencia. Nuestra ventana de logs arranca en
el último deploy y sólo cubre ese turno, así que sería 1 de 1 y eso no es una
tasa. El dueño lo describe como frecuente ("también muere muy seguido") y a lo
largo de la tarde vimos varias caídas — pero buena parte de ésas sí fueron
deploys nuestros reiniciando la máquina, así que no las contamos.

Dos preguntas concretas:

1. ¿Hay algo del lado de ustedes para ver por qué ese worker no arrancó? ¿Es cold
   start, cupo, o la caja reciclada?
2. ¿Tiene sentido que reintentemos nosotros al recibir `failed to start`, o eso
   empeora las cosas? Hoy no reintentamos: el turno simplemente se pierde, y el
   usuario tiene que volver a escribir lo que ya había pedido.

---

# 2026-08-18 · Lo que queremos que EasyBits provea de forma nativa

Contexto: pasamos una noche entera optimizando cómo Nik edita una landing. Casi todo lo que
construimos son **rodeos a huecos de la plataforma**, no funcionalidad nuestra. Preferimos que
usar EasyBits sea una ventaja y no algo que haya que compensar, así que aquí va lo que pedimos,
con lo que medimos y con lo que hace la industria.

Todo lo que sigue está **medido en producción**, no supuesto.

## 1. SDK tipado en vez de `discover_tools` + `run_tool` (lo más importante)

**Lo que medimos.** Un turno para cambiar dos imágenes gastó **~18 llamadas**: 5 capturas, 5
scrapes, 4 lecturas de archivo y **3-4 `discover_tools`**. Cada `discover_tools` devuelve los
**schemas completos**: con `domain:"landing"` son ~2,800 caracteres sólo de descripciones, y sin
filtro, del orden de 10-15 KB. Y `run_tool` añade un salto HTTP más por cada tool que vive en el
catálogo remoto del consumidor.

Nuestro parche fue meter un índice de tools con su firma exacta en el system prompt, para que el
agente pueda llamarlas sin descubrirlas. Funciona, pero es un catálogo duplicado a mano que se
desincroniza solo.

**Lo que hace la industria.** Cloudflare **Code Mode** expone **dos** tools —`search()` y
`execute()`— contra un **SDK TypeScript generado** desde el catálogo, y el modelo escribe código
en un isolate V8. Reportan **1.17 M → ~1,000 tokens** sobre 2,500 endpoints (−99.9%); Anthropic
reporta **150 k → 2 k** en su caso Drive→Salesforce. La razón de fondo que dan es buena: el
modelo ha visto muchísimo TypeScript real y muy pocos ejemplos de tool-calling; y encadenar
llamadas en código evita que la salida de cada una pase por el modelo sólo para copiarla a la
entrada de la siguiente.

**Lo que pedimos.** Generar el SDK tipado desde el catálogo ya fusionado (el horneado + el que
sirve el consumidor en `/api/mcp/catalog`) y exponer `search()` + `execute()`. Ustedes ya tienen
las dos piezas difíciles: la caja aislada y la fusión de catálogos. Falta el tipado y dejar que
el agente escriba código en vez de una llamada por paso.

Refs: [Code Mode](https://blog.cloudflare.com/code-mode-mcp/) ·
[patrones](https://developers.cloudflare.com/agents/model-context-protocol/codemode/)

## 2. System prompt POR TURNO, no congelado al crear la conversación

**Lo que medimos.** El `appendSystemPrompt` **sólo se aplica al crear la conversación** (sticky
por `groupId`). Consecuencia real: pasamos horas desplegando reglas que el agente **nunca leyó**.
Interceptamos el POST y el `dataId` correcto salía en cada turno con `screenChanged: true`,
mientras el agente contestaba sobre el **primer nodo de toda la sesión** — textualmente, *"no
tengo acceso en vivo a tu selección"*. Y llegó a borrar dos imágenes con una tool que la regla
desplegada le prohibía, porque esa regla estaba congelada.

**Nuestro rodeo.** Mover todo el contexto al **mensaje del usuario**, envuelto en etiquetas. Sirve,
pero ensucia el turno y nos obliga a decidir por él qué merece repetirse.

**Lo que hace la industria.** El OpenAI Agents SDK tiene *dynamic instructions*: una función que
recibe el contexto y devuelve las instrucciones **en cada corrida**. Es lo normal, no una
exquisitez.

**Lo que pedimos.** Que el `appendSystemPrompt` de cada turno se aplique a ese turno. Si el motivo
de congelarlo es la caché de prompt del proveedor, dennos al menos un canal explícito
(`systemDelta` por turno) y nosotros decidimos qué mandar.

Ref: [Agents SDK](https://openai.github.io/openai-agents-python/agents/)

## 3. Catálogo con TTL, no caché por sesión

**Lo que medimos.** Dos veces nos frenó lo mismo: *"reinicien el cliente MCP o seguirán viendo el
esquema cacheado"* — primero con `audit_page`, luego con el `dataId` de `screenshot_url`. Nuestro
propio catálogo remoto ya lo resuelve (TTL de 60 s con backoff), pero el horneado de la caja no.

**Lo que hace la industria.** La spec **MCP 2026-07-28** quitó las sesiones y el handshake de
`initialize`: ahora `tools/list` devuelve **`ttlMs` y `cacheScope`**, con orden determinista, y
eso **complementa** a `notifications/tools/list_changed` en vez de reemplazarlo. Está pensado
exactamente para este problema.

**Lo que pedimos.** Adoptar `ttlMs`/`cacheScope` y honrar `list_changed`. Que una tool nueva llegue
sin que nadie reinicie nada.

Refs: [spec 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/) ·
[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

## 4. Telemetría del turno

**Lo que medimos.** Su SSE sólo trae `chunk`, `tool`, `done` y `error`, y el evento `tool` lleva
**el nombre y nada más** — sin argumentos, sin duración, sin resultado. Para entender un turno de
**298 segundos** tuvimos que contar los eventos nosotros, del lado del servidor, y aun así no
sabemos cuántos tokens costó. El ledger de una plataforma que factura IA no debería depender de
que cada consumidor invente su propia contabilidad.

**Lo que hace la industria.** Las **OpenTelemetry GenAI semantic conventions** ya son el estándar:
span `invoke_agent` con hijos `execute_tool` y `chat`, y `gen_ai.usage.input_tokens` /
`output_tokens`. Lo soportan Datadog, Honeycomb y New Relic, y lo emiten LangChain, CrewAI y
AutoGen.

**Lo que pedimos.** Un evento `usage` al cerrar el turno con tokens y duración, y `execute_tool`
con nombre, duración y si falló. Si emiten OTel directamente, mejor: nos ahorra el ledger propio.

Ref: [OTel GenAI](https://opentelemetry.io/blog/2026/genai-observability/)

## 5. Pausa y reanudación para las aprobaciones

**Lo que medimos.** Cuando una acción necesita permiso del dueño devolvemos 409 y **el turno se
acaba ahí**. El agente **nunca se entera** de si se aprobó: no hay callback, y quien ejecuta al
final somos nosotros, fuera de la conversación. En producción se quedó pidiéndole al dueño que
aprobara una tarjeta que **ya no existía** (el buzón devolvía cero pendientes) — sin salida
posible, porque lo que le pedían no estaba en su pantalla.

**Lo que hace la industria.** LangGraph lo tiene resuelto con `interrupt()` + `Command(resume=…)`:
el grafo se pausa, el estado se guarda en un checkpointer, y se reanuda **exactamente donde
estaba** con la decisión —aprobar, editar, rechazar o responder—. Lo llaman el patrón HITL más
común en producción, y el fallo típico es justo no tener checkpointer.

**Lo que pedimos.** Un primitivo de pausa/reanudación: que podamos suspender el turno con un
token, y reanudarlo con la decisión del dueño. Hoy lo emulamos con un 409 y una regla de prompt
que le pide no insistir — o sea, con una petición, no con una garantía.

Ref: [HITL en LangGraph](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)

---

## Prioridad, si hay que elegir

1. **SDK tipado** — es el que cambia el orden de magnitud.
2. **System prompt por turno** — es el que nos hizo perder una noche entera sin saberlo.
3. **TTL del catálogo** — barato y ya está en la spec.
4. **Telemetría** — sin ella nadie puede afirmar que algo mejoró.
5. **Pausa/reanudación** — el más grande, y el que menos duele hoy.

Lo de la caja dormida (nuestro reintento del lado cliente) y el recorte por nodo ya quedaron
resueltos y funcionando; gracias por esos dos.

---

## Respuesta de EasyBits (2026-08-18)

Verificado contra el código, no contra la doc. Empiezo por lo que ya no hace falta pedir, porque
parte de esto lleva tiempo shipeado y nadie les avisó — y mientras tanto ustedes tienen reglas en
el prompt de Nik que le **prohíben** usar capacidades que sí existen. Eso es culpa nuestra.

**Cerrado y movido abajo**: `insert`/`remove` (salió como `patch_node`, y **acepta `html` suelto**
— es la salida (a) de su pregunta bloqueante), `screenshot_url` (con `waitMs` honrado, `dataId`
para recortar y emulación móvil real), `search_icon`, y `bakeTailwind` (lo tomamos nosotros en el
SDK; no lo parcheen de su lado). Detalle de cada uno en CERRADO.

Ahora las cinco nuevas.

### 1. SDK tipado — el hueco es más chico de lo que creen, y no es el tipado

**El SDK tipado ya existe y está publicado**: `@easybits.cloud/sdk` (`packages/sdk/src/index.ts`,
~3,000 líneas escritas a mano, no generadas). Cubre REST API v2 con tipos, y ahí dentro ya están
`searchIcon()` y `screenshot()`. O sea que el índice de tools que metieron en el system prompt
está duplicando a mano algo que ya tiene `.d.ts`.

Dicho eso, su medición es correcta y el problema es real. Los huecos verdaderos son tres, y
ninguno es "generar el SDK":

1. **No está dentro de la caja.** El worker no trae el SDK preinstalado ni su key cableada, así
   que el agente no tiene forma de escribir `eb.searchIcon(...)` y acaba descubriendo tools.
2. **Cobertura incompleta.** Las tools que sólo viven en MCP no tienen método: `patch_node`,
   `get_node_outline`, `audit_page`. Justo las tres del bucle de edición que a ustedes les importa.
3. **No hay `execute(code)`.** Hoy el camino es Bash, o sea un proceso por paso.

Vamos por esos tres. Es la petición que más superficie toca (template + SDK + publicación a npm),
así que va después de las baratas — pero coincidimos en que es la que cambia el orden de magnitud.

### 2. System prompt por turno — aceptado, y la causa es otra

Su síntoma es exacto; el diagnóstico "se congela al crear la conversación" apunta al lugar
equivocado, y vale la pena que lo sepan porque cambia dónde está el arreglo.

El worker **sí** compone `[persona, appendSystemPrompt]` en cada turno. En la ruta *persistente*,
un cambio del append entra en la firma de config y recicla la sesión, así que ahí ya funciona.
Pero ustedes mandan `denikApiKey` —correctamente, es lo que scopea su MCP por turno— y eso fuerza
la ruta **cold**, que reanuda por `continuation`. El SDK de Claude conserva el system prompt con
el que se abrió esa sesión: el `instructions` recompuesto se arma bien y no llega a ninguna parte.

Arreglo: detectar el cambio del append respecto al turno anterior e inyectarlo como **nota de
sistema fresca del turno**, que es el mecanismo que ya usamos para el guardrail de modelo y para
los turnos admin de WABA. Es cambio en el worker → exige rebake del template en los dos fierros,
por eso no es de hoy para mañana.

### 3. TTL del catálogo — aceptado

`ttlMs` + `cacheScope` en `tools/list` con orden determinista, y honrar `list_changed`. Coincidimos
en que es el más barato de los cinco y en que "reinicien el cliente MCP" es una respuesta
vergonzosa que dimos dos veces.

### 4. Telemetría — aceptado, y es puro cableado

Dato que les va a gustar: **el worker ya mide**. Hay `reportUsage` con tokens de entrada y salida,
modelo y snapshot de ocupación de ventana, más eventos de compactación cuando la sesión pierde
información. Nada de eso es nuevo.

Lo que falla es el último tramo: nuestro SSE reenvía `{type:"tool", name}` y **tira el resto**.
Van a recibir `usage` al cerrar el turno (tokens, modelo, duración) y `tool` con duración y si
falló. Nombramos los campos siguiendo las convenciones GenAI de OTel para que no tengan que
traducir si algún día emitimos OTel de verdad.

Su frase —"el ledger de una plataforma que factura IA no debería depender de que cada consumidor
invente su propia contabilidad"— es correcta y no tenemos defensa.

### 5. Pausa/reanudación — aceptado, sin fecha

Es un primitivo nuevo, no cableado, y coincidimos con ustedes en que es el que menos duele hoy. Lo
que describen de producción —pedirle al dueño que apruebe una tarjeta que ya no existe— es el
fallo típico de HITL sin checkpointer, y su rodeo con 409 + regla de prompt es efectivamente una
petición y no una garantía. Queda en la lista, honestamente etiquetado como el más grande.

### Orden

**4 → 3 → 2 → 1 → 5.** Distinto del suyo por una razón: el 4 y el 3 son cableado de horas, no de
días, y el 4 es precondición de todo lo demás (sin telemetría nadie puede afirmar que el 1
mejoró algo — es su propio argumento). El 2 les devuelve la noche que perdieron y va en cuanto
haya rebake. El 1 sigue siendo el que cambia el orden de magnitud.

### El worker que no arrancó (`6a83a765…`)

Sí tenemos con qué verlo, y encaja con un bug que ya teníamos abierto. Respondiendo sus dos
preguntas:

**1. ¿Cold start, cupo o caja reciclada?** **Cupo.** El techo de cajas se cuenta **por cuenta**,
pero el desalojo LRU —el que libera un slot durmiendo la conversación más vieja— sólo busca
víctimas dormidas **del mismo FleetAgent**. Así que un agente choca contra un techo que llenaron
sus hermanos y falla al arrancar aunque haya capacidad perfectamente reciclable al lado. Es
nuestro, está identificado, y el arreglo no es de una línea: la caja liberada trae horneado el
motor y la persona de SU agente, así que hay que destruirla y spawnear fría, no adoptarla.

**2. ¿Tiene sentido que reintenten?** **Sí, con backoff, y deberían.** No empeora nada: nuestra
propia superficie de WhatsApp hace exactamente eso desde hace meses —retiene el mensaje y
reintenta 5→30s hasta ~4 minutos— precisamente porque el reaper duerme una caja ociosa en ese
intervalo y un reintento posterior sí entra. El techo de ~4 min está puesto **por encima** del
tiempo que tarda en aparecer una víctima; si lo bajan a 3 se rendirán justo antes. Hoy el turno se
pierde por no reintentar, no por reintentar.

Sobre la frecuencia: coincidimos en que 1 de 1 no es una tasa, y agradecemos que lo digan así en
vez de reportarlo como "falla siempre".

### SSRF

Tomado, y su dato cambia la prioridad hacia arriba: si la URL la **compone el agente** leyendo el
HTML de la landing, entonces una instrucción inyectada en el contenido de una página es un camino
real hacia "capturá esta URL interna". Estrecho, pero es exactamente la forma que tiene este tipo
de fallo antes de dejar de ser teórico. El cierre sigue siendo firewall de egress.
