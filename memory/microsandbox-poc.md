# Microsandbox POC — Jueves 2026-05-07

**Objetivo**: validar si microsandbox aguanta como base de un producto sandbox-as-a-service estilo Deno antes de comprometernos con la stack. POC standalone, sin tocar Easybits.

**Repo**: https://github.com/superradcompany/microsandbox
**Docs**: https://docs.microsandbox.dev
**Licencia**: Apache 2.0
**Status**: beta autodeclarada

---

## Hipótesis a validar

1. La beta corre en Apple Silicon sin drama de instalación.
2. El boot `<100ms` que prometen es real, no marketing.
3. El SDK (Python o TS) tiene DX decente, no es Rust con maquillaje.
4. El MCP server built-in funciona out-of-the-box con Claude Desktop / Claude Code.
5. Un agente puede ejecutar código y levantar servicios persistentes (Flask, WordPress) sin glue code custom.

Si las 5 pasan → vamos a fase 1 (Hetzner, multi-tenant básico).
Si fallan H1–H4 → la beta no está, evaluamos fork o esperar.
Si fallan H5–H8 → motor sirve, packaging no — evaluar libkrun directo.

---

## Plan de hitos

Tiempo estimado total: **~3 horas si todo va bien**, medio día con contratiempos.

### H1 — Instalación
- [ ] Instalar microsandbox en Mac Apple Silicon
- [ ] `msb --version` (o equivalente) responde
- [ ] No requiere setup raro (rosetta, kernel custom, etc.)

**Criterio de éxito**: comando responde, dependencias resueltas.
**Resultado**:

---

### H2 — Primer sandbox
- [ ] Bajar imagen base (alpine o python oficial)
- [ ] Arrancar 1 sandbox vacío
- [ ] Medir tiempo real de boot con `time` o equivalente

**Criterio de éxito**: boot real `<500ms` (margen sobre el `<100ms` que prometen).
**Resultado**: tiempo medido = ___

---

### H3 — Ejecutar código vía CLI
- [ ] `print("hola")` Python adentro del sandbox
- [ ] Stdout vuelve al host
- [ ] Exit codes funcionan

**Criterio de éxito**: stdin/stdout/exit code fluyen sin pérdida.
**Resultado**:

---

### H4 — SDK
- [ ] Instalar SDK (Python o TS, el que vea más maduro)
- [ ] Ejecutar el mismo `print("hola")` desde código, no CLI
- [ ] Probar manejo de errores (sandbox que crashea, código inválido)

**Criterio de éxito**: API ergonómica, errores claros, no es wrapper sucio del CLI.
**Resultado**:

---

### H5 — MCP server
- [ ] Arrancar el MCP server que viene con microsandbox
- [ ] Conectarlo a Claude Desktop o Claude Code
- [ ] `tools/list` muestra las herramientas esperadas

**Criterio de éxito**: el MCP server registra tools como `run_python`, `run_node`, etc., visibles en cliente MCP.
**Resultado**:

---

### H6 — Agente ejecuta código
- [ ] Pedirle a Claude: "ejecuta este script Python que parsea un CSV y dame el resultado"
- [ ] El agente decide solo usar el sandbox
- [ ] Resultado vuelve correcto

**Criterio de éxito**: el agente entiende cuándo usar el sandbox sin instrucción explícita.
**Resultado**:

---

### H7 — Servicio persistente: Flask
- [ ] Pedir a Claude: "levanta un Flask hello world en un sandbox y dame el URL"
- [ ] El agente mapea puerto al host
- [ ] `curl localhost:PORT` desde el host responde

**Criterio de éxito**: networking sandbox → host funciona, proceso persiste, agente entiende el modelo.
**Resultado**:

---

### H8 — Stack real: WordPress (test killer)
- [ ] Pedir a Claude: "levanta un WordPress oficial con su MySQL y dame el URL del wp-admin"
- [ ] La microVM aguanta multi-proceso (nginx + PHP-FPM + mysqld)
- [ ] `wp-admin` carga, login funciona, uploads se persisten

**Criterio de éxito**: stack completo corre, página carga, primera medición de memoria/CPU usados.
**Resultado**: memoria pico = ___ MB, boot total (incluyendo pull) = ___

---

## Lo que NO está en el POC (deliberadamente)

- Multi-tenant / aislamiento entre clientes.
- Hetzner / bare metal — todo local.
- Egress filtrado, networking custom, dominios.
- Integración con Easybits MCP server.
- Stress test serio (los 50 ejecuciones quedan para fase 1).
- Observability/logging.
- Pricing/billing.

---

## Decisiones que H8 va a forzar (anotar findings aquí)

### Memoria por sandbox
WP+MySQL pide ~512MB-1GB cómodos. Esto define pricing.
**Observado**:

### Persistencia entre runs
¿El sandbox de WP sobrevive si el agente se desconecta? ¿Hay snapshot?
- Si **sí persiste** → producto tipo Replit/Codesandbox (long-running, premium).
- Si **no persiste** → producto tipo E2B (ephemeral, scripts).

Estos son dos productos distintos. Esta es la decisión más estratégica del POC.

**Observado**:

### Boot time con imagen gorda
El `<100ms` es para imagen tibia. Primer pull de WP es 30-60s. Estrategia de pre-warming necesaria en producción.

**Observado**: pull primero = ___s, boot tibio = ___ms

---

## Conclusión del POC (llenar al final)

- [ ] **Fase 1 GO** — H1–H8 pasaron, vamos a Hetzner.
- [ ] **Fase 1 GO con reservas** — pasó pero hay X que parchar/forkear primero.
- [ ] **Pivote a libkrun directo** — motor sirve, microsandbox no.
- [ ] **Pausa** — beta no está, revisitar en N meses.

**Decisión final**:

**Razón**:

**Próximo paso**:

---

## Comandos de referencia

(Llenar al instalar, primera fila ya investigada)

```bash
# Install (verificar comando exacto en docs)
curl -sSf https://get.microsandbox.dev | sh

# Versión
msb --version

# Bajar imagen base
msb pull python:3.12-alpine

# Arrancar sandbox y ejecutar
msb run python:3.12-alpine -- python -c "print('hola')"

# MCP server
msb mcp serve

# Logs
msb logs <sandbox-id>

# Cleanup
msb prune
```

---

## Notas y contratiempos

(Llenar durante la ejecución)
