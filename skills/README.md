# Skills — custom tools por tenant (patrón oficial)

Una **skill** es la unidad oficial para darle a un agente de la flota una tarea
única de un cliente (cotizar con SU plantilla, un flujo de facturación propio,
etc.) **sin tocar el core**. Es el patrón que Anthropic recomienda para Agent
Skills, adaptado a la flota: `SKILL.md` (instrucciones) + `scripts/` (código
determinista) + `assets/` (plantillas, logos).

## Por qué un script y no prosa

Para dinero (totales, IVA, folios) la corrección **no se delega al lenguaje** —
se bundlea un script determinista. Cita de Anthropic: *"Code is deterministic;
language interpretation isn't."* El `SKILL.md` le dice al agente **corre el
script**, no *calcula tú*. Así el mismo input da el mismo PDF byte a byte.

## Anatomía

```
skills/<nombre>/
  SKILL.md            # qué hace, cuándo, y "corre scripts/x.mjs"
  scripts/*.mjs       # lógica determinista (valida + calcula + renderiza)
  assets/*            # plantillas HTML, logos (opcional; se pueden inlinear)
```

## Cómo corre en la flota

1. Los archivos de la skill se suben a **Archivos** (S3 público) del owner y se
   adjuntan al agente (`groupConfigs["*"].assets`). El manifiesto nombre→URL se
   inyecta al prompt del turno (`resolveGroupAssetManifest`).
2. El `SYSTEM_PROMPT` del agente trae el trigger ("cuando pidan X, corre la skill").
3. El worker (microVM, code-mode) descarga el script por Bash y lo corre con
   `node`. El script usa el env ya inyectado: `$EASYBITS_BASE_URL`,
   `$EASYBITS_API_KEY`, y los secrets de conectores encendidos (`$MP_ACCESS_TOKEN`…).
4. El script hace su trabajo determinista y devuelve un artefacto sendeable
   (una `pdfUrl` hospedada) → el agente la manda al cliente.

Esto es code-mode + Agent Skills: la CAPACIDAD siempre disponible (el agente
puede correr scripts), la SKILL es lo que la vuelve una tool concreta por-cliente.

## Referencia

`siiqtec-quote/` — cotización SIIQTEC/Totequim: valida líneas, calcula subtotal +
envío, genera link MercadoPago, arma plantilla oficial (productos + ficha de
depósito con datos bancarios y QR) y devuelve el PDF hospedado. Port fiel del
`siiqtec-quote.ts` de nanoclaw. Branding por env `QUOTE_*` → replicable a marcas
hermanas sin cambiar el código.
