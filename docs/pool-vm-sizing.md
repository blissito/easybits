# Tamaño de las VMs (sandboxes) del Pool — diseño

> Resumen de lo que hemos venido discutiendo. Pregunta: **¿de qué tamaño se levanta
> la VM y cómo lo controlamos? ¿por agente? ¿por cuenta?**

## El reframe (lo más importante)
La pregunta "¿de qué tamaño levanto LA VM del agente?" es la equivocada. En un RTS
no le pones lanzallamas a cada aldeano por si algún día hay que quemar algo. Separa:

- **VM-cerebro (claude-worker)** = unidad barata. Se dimensiona por **concurrencia**,
  no por capacidades. Nunca carga Chromium.
- **Capacidades pesadas** (Chromium-snapshot, ffmpeg, GPU, jupyter) = **taller
  compartido**. No viven en el agente: fleet aparte, on-demand, scale-to-zero, que
  cualquier cerebro liviano invoca. Un Chromium sirve a 50 agentes.

## Medición real (2026-06-24) — rutas ≠ turnos concurrentes
> `scripts/pool-vm-rss-probe.ts` contra el host OVH, claude-worker @ 2GB/2vCPU.

| Métrica | Valor |
|---|---|
| baseline VM idle (kernel + node dispatcher + runtime) | **182 MB** |
| 2 turnos LIGEROS concurrentes (texto puro, sin tools), pico total | **624 MB** |
| incremento por turno ligero | **~221 MB** |
| presupuesto recomendado por turno con MCP/tool calls | **~450 MB** |

**La distinción que faltaba:** el costo de RAM lo paga el **TURNO ACTIVO** (subproceso
`claude`), no la conversación. Entre turnos el subproceso `claude` SALE → una ruta
pegajosa dormida cuesta ~0 RAM (solo su dir en disco). Entonces:
- Una VM puede **GUARDAR** muchas conversaciones (rutas pegajosas, baratas en disco).
- Pero solo puede **CORRER** K turnos a la vez (RAM = 182 + K×~450 + holgura).

Hoy `maxWorkersPerVm` mezcla ambas: cuenta **rutas**, pero el OOM es por **turnos
concurrentes** (ráfaga = varios grupos responden a la vez). Con 512MB y
`maxWorkersPerVm=3`, una ráfaga de 3 respuestas pide 182+3×~250 ≈ 930MB → OOM y los
workers no responden. **Por eso `claude-worker` NO cabe en 512MB.**

**Fix correcto (pendiente):** separar las dos perillas — `maxRoutesPerVm` (pegajosidad,
alta, p.ej. 10-20, barata en disco) vs `maxConcurrentTurnsPerVm` (RAM, baja, 2-3 por
2GB), esta última hecha cumplir DENTRO del worker (`services/claude-worker`) con un
semáforo + cola (timeout para que WhatsApp no cuelgue). Así una VM chica aloja muchas
conversaciones pero acota el pico de RAM. Regla de tamaño:
`vmMemMb ≈ 182 + turnos_concurrentes×450 + 256` → 1GB≈1-2 turnos, 2GB≈3, 4GB≈7.

> La tabla de clases abajo decía Texto=512MB; la medición la corrige a **1GB mínimo**
> para claude (1 turno con tools + holgura). 512MB queda para cerebro ligero
> (ghosty-gc/deepseek) o turnos estrictamente serializados (concurrencia=1).

## La regla de oro (dónde vive cada cosa) — frecuencia × peso
- **Frecuente + liviano** → horneado en el cerebro (su kit base de MCP/texto).
- **Ocasional + pesado** → **servicio compartido** (ej. `browser-svc` con
  `POST /snapshot {url}→png`). El worker lo llama vía tool; NO sube de tamaño.
- **Continuo + pesado** → **unidad dedicada con loadout pesado** (clase declarada).

## Cómo se controla el tamaño: CLASE del Agente (loadout)
El tamaño es **propiedad del Agente**, declarada al crearlo (editable después).
3 clases, estilo "elige tu personaje":

| Clase       | RAM    | Para qué                                   |
|-------------|--------|--------------------------------------------|
| **Texto**   | 1GB    | atiende y responde con tools de EasyBits. El 90%. (default) — medido: 1 turno con tools + holgura. 512MB se queda corto para claude. |
| **Navegador** | 2GB  | necesita ver/capturar webs, llenar forms (Chromium baked) |
| **Estudio** | 4GB    | multimedia pesado (video/imágenes)         |

Mecánica concreta: un campo `size`/`class` en el Pool(Agente) → mapea a `memMb`/`vcpus`
que ya consume `spawnVm` (`createAgent({ memoryMb, vcpus })`). Hoy está fijo en 512;
solo hay que leerlo de la clase del agente.

## Dos principios que lo hacen óptimo (y atan al HUD de Capacidad)
1. **El peso cuesta supply.** Un Navegador (2GB) consume 4× lo que un Texto (512MB)
   → en el HUD ocupa más capacidad. Igual que el costo de supply de una unidad en
   un RTS. Así "agentes ilimitados, capacidad acotada" se siente justo.
2. **Pesado-ocasional → servicio compartido, no upsize.** Un agente Texto que de vez
   en cuando necesita un screenshot NO sube de clase: llama al `browser-svc`
   compartido. Solo subes de clase si la necesidad es **continua**.

## Cómo elige el usuario la clase
- **Fase 1 (recomendada para empezar):** 3 tarjetas de clase en "Nuevo agente".
  Claro, predecible, default = Texto = un clic.
- **Fase 2 (magia, después):** "describe qué hace tu agente" en texto → la IA
  **pre-selecciona** la clase (y de paso siembra el system prompt). La clase siempre
  visible/editable para que nunca te sorprenda el tamaño.

## Equivalencia con el plan / capacidad de la cuenta
Capacidad de la cuenta = **`concurrentSandboxes` del plan** (una VM del pool *es* un
sandbox): Byte=2, Mega=3, Tera=10 sandboxes. Cada sandbox aloja `maxWorkersPerVm`
agentes (hoy 2). Un agente de clase pesada ocupa más de ese presupuesto.

## Siguiente
1. Terminar el rediseño del HUD (en curso).
2. Cablear el selector de clase en "Nuevo agente" + `spawnVm` que lea `memMb` de la clase.
3. Stress tests de capacidad real.
4. (Después) `browser-svc` como primer taller compartido on-demand + tool `take_snapshot`.
