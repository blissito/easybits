# Sandboxes agénticos: casos de uso reales (research citado)
*Base para el lead-magnet de EasyBits — 2026-06-05. Cada afirmación con fuente. Lo refutado está marcado al final: NO citar.*

## TL;DR — la categoría ya es real, no experimental
- E2B (líder citado) pasó de **40,000 sandboxes/mes (mar 2024) a ~15 millones/mes (mar 2025)**, **500M+ acumulados**, usado en **>50% del Fortune 500** (cofundador en Latent Space; E2B Series A; VentureBeat). *Cifras autorreportadas por el vendor — citar con atribución y fecha.*
- **Cloudflare** llevó sus Sandboxes a **disponibilidad general (13 abr 2026)** durante su "Agents Week", posicionados explícitamente para cargas de agentes IA (Cloudflare changelog; InfoQ).
- **OpenAI Agents SDK** integra nativamente ~**7-8 proveedores** de sandbox (Blaxel, Cloudflare, Daytona, E2B, Modal, Runloop, Vercel) — el mercado está disputado y estandarizándose (Modal; OpenAI docs).

→ Conclusión para el magnet: no estamos "inventando" una categoría; estamos trayéndola a LatAm/pesos con stack integrado.

## Cómo lo usan los líderes (mapa por vertical, con casos reales)
| Vertical | Caso real (empresa) | Fuente |
|---|---|---|
| Análisis de datos + gráficas | **Perplexity** lanzó "advanced data analysis" en **1 semana con 1 ingeniero** (microVM Firecracker corriendo código de LLM) | e2b.dev/blog/how-perplexity-… |
| Agente autónomo con "computadora" | **Manus**: 27 herramientas, "necesita una computadora virtual completa para trabajar como humano" (cofundador Tao Zhang) | e2b.dev/blog/how-manus-… |
| RL / investigación IA | **Hugging Face** (RL para código, réplica DeepSeek R1), **LMArena** (evals de code-gen, 230k+ sandboxes) | latent.space/p/e2b |
| Automatización financiera (back-office) | **Ramp** (50,000+ clientes): su agente interno corre en **Modal sandboxes** con entorno full-stack (Postgres/Redis/Temporal/RabbitMQ + VS Code server + VNC/Chromium); el agente escribe **>50% de los PRs** fusionados | modal.com/blog/…ramp; builders.ramp.com; InfoQ |
| Generación-y-preview de mini-apps | **E2B Fragments** = versión open source de **Claude Artifacts / Vercel v0 / GPT Engineer**; ejecuta código IA en sandbox aislado | github.com/e2b-dev/fragments |
| Verticales emergentes (YC) | Legal (**Arcline**), logística/soporte (**Prox**), DevOps/testing de tests generados por IA (**Syntropy**), video IA con Remotion (**Resonate**) | e2b.dev/blog/yc-companies-ai-agents *(fuente única vendor — verificar antes de citar fuerte)* |

## El patrón técnico (y cómo EasyBits lo cumple 1:1)
Definición canónica de OpenAI (docs oficiales): *"entorno de ejecución aislado tipo Unix con filesystem, shell, paquetes, datos montados, **puertos expuestos**, snapshots y acceso controlado a sistemas externos"*. Cada pieza mapea a EasyBits:
- Aislamiento real **microVM Firecracker** (<200ms, sin cold starts) — igual que E2B; superior a contenedores Docker compartidos (E2B home; Modal).
- **Kernel persistente** estilo Jupyter (variables/imports persisten entre llamadas) — Cloudflare lo documenta igual (`sbx.runCell`).
- **URL pública de preview vía puerto expuesto** — validado por OpenAI ("app local, notebook, report server, browser preview") y por **Cloudflare `exposePort()`** (URL HTTPS única `{port}-{id}-{token}.dominio`, TLS + wildcard auto). Es **idéntico** a `exposePort` → `sb-xxx.sandboxes.easybits.cloud`. **Aquí está el moat más fuerte de EasyBits.**

## Panorama competitivo
Al menos 7-8 proveedores con aislamiento diferenciado: Firecracker microVM (E2B, Vercel), gVisor (Modal), Kata/Cloud-Hypervisor/gVisor (Northflank), OCI con kernel+fs+red dedicados (Daytona), microVM (Blaxel), contenedores Linux (Cloudflare), + Runloop. Todos convergen al mismo patrón. **Ninguno bundlea sandbox + storage + DB + AI + publishing en pesos** — ese es el hueco de EasyBits.

## Shortlist de demos a construir (síntesis — impacto × fit vs esfuerzo)
1. **Generación-y-preview de mini-app/dashboard** (URL pública en vivo) — *máximo fit con el moat exposePort; categoría probada (Artifacts/v0/Fragments)*. Esfuerzo medio. **Hacer primero.**
2. **Analista de datos como producto** (sube Excel → KPIs + gráficas + PDF) — caso Perplexity productizado para PyME. Esfuerzo bajo (ya tenemos kernel + charts + docs). **Hacer primero.**
3. **Agente que arma y muestra un reporte/site a un cliente final** (research → DB → dashboard público). Combina DB + exposePort.
4. Back-office/finanzas (estilo Ramp, pero para PyME LatAm) — alto valor, requiere validación MX (ver hueco).
5. QA/testing de código generado (Syntropy) — terreno dev, competido.
6. Pipeline de media (ffmpeg/imágenes sobre storage).

## Ideas no-obvias / contrarian
- **El preview público como el producto, no la ejecución**: el mercado vende "corre código"; EasyBits puede vender "tu agente te entrega una URL viva que enseñas al cliente". Nadie lo está posicionando así.
- **Bundle integrado para LatAm**: sandbox + AI + hosting + DB en pesos, sin factura USD ni metered sorpresa — TCO imbatible para solo/agencia/PyME.

## Precios verificados (jun 2026 — pricing pages primarias)
Config típica 2 vCPU / 4 GiB, cómputo por hora (sin storage):
| Proveedor | Modelo | 2vCPU/4GiB | Cuota fija | Free |
|---|---|---|---|---|
| E2B | suscripción + cómputo/seg | ~$0.166/h | **$150/mo (Pro)** | $100 créditos |
| Daytona | pay-as-you-go | ~$0.166/h | — | $200 créditos |
| Modal | pay-per-second (~3× premium) | ~$0.24/h (hasta ~$0.30 US) | — | $30/mo créditos |
| Vercel Sandbox | Active CPU $0.128/h + mem $0.0212/GB-h | ~$0.34 (4vCPU/8GB·30min) | — | Hobby: 5h CPU/mo |
| Cloudflare | sobre Workers Paid | metered | **$5/mo base** | sin free tier |

Todos cobran **por uso, por segundo/hora, en USD**. Dato corregido (la 1ª pasada lo había refutado): los $150/mo de E2B son **cuota de suscripción que se SUMA al cómputo**, no precio todo-incluido. → Ángulo EasyBits: **flat en pesos, bundle (sandbox+AI+storage+DB+publishing), sin metered ni factura USD sorpresa.** (Fuentes: e2b.dev/pricing, daytona.io/pricing, modal.com/pricing, vercel.com/docs/sandbox/pricing, developers.cloudflare.com/containers/pricing)

## Demanda México (verificada por fuentes primarias)
- **PwC México** (sep 2025) y **EY México** definen los casos fiscales de mayor valor para agentes IA: **verificación de CFDI, atención a requerimientos del SAT, conciliación CFDI-vs-ERP**, en entornos controlados con accesos por rol y bitácoras auditables — exactamente lo que da un sandbox aislado. EY/IDC cuantifican: **hasta 85% menos tiempo de conciliación, ~120 hrs/mes ahorradas** por equipo contable, validación CFDI 4.0 contra listas EFOS/EDOS.
- Tamaño del universo (SAM): **6,058,548 establecimientos** en México (94% microempresas — INEGI/DENUE, nov 2024); **10,323 millones de CFDI emitidos en 2023** (327/segundo — SAT).
- Fuentes: pwc.com/mx/…agentes-ia-en-funcion-fiscal · ey.com/es_mx/…agentic-ai-tax · gob.mx/sat/prensa/…10-mil-millones-2023 · inegi.org.mx (DENUE 2024).

## Preview-as-product: el moat con tracción real
El patrón "el entregable es la app desplegada y compartible (URL), no el código" tiene resultados comerciales:
- **Bolt.new** (StackBlitz): **~$40M ARR a marzo 2025**, de $0 a $4M ARR en 30 días tras lanzar (oct 2024). *ARR autorreportado, multi-fuente.*
- **Base44**: genera apps con DB/auth/hosting integrado ("instantly live and shareable"), **vendida a Wix por $80M cash (2025)**.
- Fuentes: sacra.com/c/bolt-new · techcrunch.com/2025/06/18/…base44-sells-to-wix-for-80m. → Valida tu `exposePort` como ángulo central, no accesorio.

## Hueco que persiste (honesto)
Sí quedan dos cosas sin cerrar: (1) **no hay despliegues nombrados** de sandboxes agénticos en producción en México — la evidencia MX es de demanda y thought-leadership (PwC/EY/SAT), no de "empresa X corre sandboxes". Esto es a la vez riesgo y oportunidad (nadie atiende el nicho aún). (2) **tamaño de mercado absoluto en USD** quedó débil: las cifras de IMARC para e-invoicing MX y legal-tech LatAm fueron **refutadas**; solo sobrevive el CAGR de legal-tech LatAm (~10.7%). El magnet debe apoyarse en evidencia de demanda (volúmenes CFDI, # establecimientos, casos Big Four, % de ahorro), no en un "mercado de $X".

## Fuentes (verificadas)
latent.space/p/e2b · e2b.dev/blog/series-a · venturebeat.com/…e2b · e2b.dev (home) · e2b.dev/blog/how-perplexity-… · e2b.dev/blog/how-manus-… · e2b.dev/blog/yc-companies-ai-agents · modal.com/blog/…ramp · builders.ramp.com/post/why-we-built-our-background-agent · infoq.com/news/2026/01/ramp-coding-agent-platform · modal.com/resources/best-code-execution-sandboxes-ai-agents · developers.openai.com/api/docs/guides/agents/sandboxes · developers.cloudflare.com/sandbox/concepts/preview-urls · blog.cloudflare.com/sandbox-ga · infoq.com/news/2026/04/cloudflare-sandboxes-ga · github.com/e2b-dev/fragments

## NO citar (refutado por verificación adversarial)
- "E2B en 88% del Fortune 100" como hecho (es marketing; usar ">50% Fortune 500" con atribución).
- Precio "$150/mes plan Pro de E2B" (refutado).
- "Daytona <90ms vs Docker 2-5s" y el caso "Vstorm reemplazó Docker con Daytona" (fuente blog no verificable).
- "11 proveedores en OpenAI Agents SDK" (usar "al menos 7-8").
- Tamaño de mercado e-invoicing MX ($219.6M→$797.2M) y legal-tech LatAm ($1.9B→$4.9B) de IMARC (refutados 0-3) — solo usar el CAGR legal-tech ~10.7%.
- Cifras de ARR/propuesta de Replit (refutadas) — no citar Replit.
