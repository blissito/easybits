# Tamaño de las VMs (sandboxes) del Pool — diseño

> Resumen de lo que hemos venido discutiendo. Pregunta: **¿de qué tamaño se levanta
> la VM y cómo lo controlamos? ¿por agente? ¿por cuenta?**

## El reframe (lo más importante)
La pregunta "¿de qué tamaño levanto LA VM del agente?" es la equivocada. En un RTS
no le pones lanzallamas a cada aldeano por si algún día hay que quemar algo. Separa:

- **VM-cerebro (claude-worker)** = unidad barata. Liviana (512MB), atiende N agentes
  (conversaciones). Se dimensiona por **concurrencia**, no por capacidades. Nunca
  carga Chromium.
- **Capacidades pesadas** (Chromium-snapshot, ffmpeg, GPU, jupyter) = **taller
  compartido**. No viven en el agente: fleet aparte, on-demand, scale-to-zero, que
  cualquier cerebro liviano invoca. Un Chromium sirve a 50 agentes.

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
| **Texto**   | 512MB  | atiende y responde con tools de EasyBits. El 90%. (default) |
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
