# Conector de Claude: ficha para el directorio (2026-10-13)

URL que se envía al portal (claude.ai/directory/manage): **`https://www.easybits.cloud/api/mcp/claude`**.
Es el toolset strict `claude` (`CLAUDE_DIRECTORY_ALLOWLIST` en `app/.server/mcp/toolGroups.ts`).
La URL de siempre (`/api/mcp`, toolsets y llaves `eb_…`) no cambia para nadie. El catálogo completo es
`/api/mcp/all` (mismo OAuth, metadata propia); se documenta en `/docs#claude` → «URL completa» y
**no** se envía ni se menciona en el portal. App de ChatGPT: [chatgpt-app-directorio.md](chatgpt-app-directorio.md).

## Piezas

| Pieza | Archivo |
|---|---|
| Metadata AS (RFC 8414) | `app/routes/api/wellknown/oauth-authorization-server.ts` |
| Metadata del recurso (RFC 9728, con sufijo `/api/mcp/claude`) | `app/routes/api/wellknown/oauth-protected-resource.ts` |
| DCR (RFC 7591), https o loopback | `app/routes/api/oauth/register.ts` |
| Consentimiento para clientes DCR, `resource` (RFC 8707) | `app/routes/oauth/authorize.tsx`, `app/.server/oauth.ts` |
| 401 con `WWW-Authenticate: Bearer resource_metadata=…` | `app/.server/mcp/handler.ts` |
| `title` + `readOnlyHint`/`destructiveHint` | `app/.server/mcp/toolAnnotations.ts` (test `mcpAnnotations`) |
| Toolset del directorio | `toolGroups.ts` → `claude` (test `claudeDirectoryGroup`) |
| Docs | sección `claude` en `app/.server/docs/reference.ts` y `reference.en.core.ts` (`/docs#claude`, `/en/docs#claude`) |
| Privacidad | `app/routes/aviso.tsx` → `#aplicaciones-conectadas` |

## Qué queda fuera de `/api/mcp/claude` (decisión conservadora)

- **IA generativa de medios** (prohibida en el directorio): `create_or_edit_image`, `image_generate`,
  `edit_image`, `video_create`, `avatar_video_create`, `voice_tts_create`, personajes, proyectos de
  video (narración TTS y música), subtítulos.
- **Dinero y cómputo facturado**: links de pago, hosting/máquinas, `make_permanent`, cajas,
  `agent_run`, flota, llamadas, alta de dominios; y envío de correo a terceros.
- **Credenciales**: secrets, llaves de IA, webhooks (devuelven secreto de firma), secrets de máquina.

Strict: `run_tool`/`discover_tools` tampoco alcanzan nada de eso. Para volver a meter algo, se
agrega al allowlist y se revisa contra la política del directorio.

## Texto para el portal

- **Nombre**: EasyBits
- **Frase (≤200)**: Files, documents, PDFs, websites, forms and SQL databases for your work in Claude, plus web search and page extraction, all in your EasyBits account.
- **Descripción (≤2,000)**: EasyBits (easybits.cloud) is a cloud for AI agents, priced in MXN. This connector gives Claude your EasyBits workspace: upload and organize files served from a CDN, create and edit multi-page documents and export them as PDF, publish websites and landing pages with your own brand kit, collect leads with forms, and keep structured data in SQLite databases you can query with SQL. Claude can also search the web, read pages that block bots and extract structured records from them. Every result lives in your account, so you can share it with a link, keep editing it in the EasyBits editor, or reuse it from the API, SDK or CLI. Sign-in is OAuth with your EasyBits account (free plan available); the connector only sees what your account sees, destructive actions are marked so Claude asks before running them, and you can revoke access at any time.
- **Categorías**: Productivity · Developer tools · Design
- **Casos de uso**:
  1. *Data to answers* — «Upload this CSV to a new EasyBits database and tell me the top 10 customers by total purchases.» (`upload_file`, `db_create`, `db_query`)
  2. *Branded documents* — «Create a one-page PDF quote for Acme with my default brand kit and give me a share link.» (`get_default_brand_kit`, `create_document`, `export_document`, `create_share_link`)
  3. *Research to a published page* — «Search the web for the 5 best-rated coworkings in Guadalajara, put them in a landing page with a contact form and publish it.» (`web_search`, `web_fetch`, `create_website`, `create_form`, `deploy_website_file`)
- **Requisitos**: cuenta de EasyBits (plan gratis). Investigación web consume consultas del plan o de los packs.
- **Lee y escribe**: ambos. Escritura = crear/editar archivos, documentos, sitios, formularios, brand kits y bases; borrar va marcado como destructivo.
- **Auth**: OAuth 2.1, DCR, PKCE S256, clientes públicos, `resource` validado. Access token 1 h, refresh de un uso.
- **Datos**: API propia; datos del usuario (archivos, documentos, filas de sus bases, envíos de formularios). Ningún resultado devuelve contraseñas ni llaves de API. Sin datos de salud ni contenido patrocinado.
- **Docs**: https://www.easybits.cloud/en/docs#claude (ES: https://www.easybits.cloud/docs#claude)
- **Privacidad**: https://www.easybits.cloud/aviso-de-privacidad#aplicaciones-conectadas
- **Soporte**: soporte@easybits.cloud
- **Ícono**: `public/logo-eb.svg` → PNG cuadrado.

## Instrucciones para revisores (sin contraseñas)

Cuenta de revisión con datos de muestra: **`claude-review@easybits.cloud`**. La contraseña NO va en
el repo: se pega a mano en el campo de credenciales del portal (la tiene bliss en
`~/easybits-reviewer.txt`, 0600). Script que la crea o rota: `scripts/seed-claude-reviewer.ts`.

1. En Claude: Settings → Connectors → Add custom connector → `https://www.easybits.cloud/api/mcp/claude`.
2. Claude abre EasyBits. Si no hay sesión, entrar en **https://www.easybits.cloud/login/revisor** con el
   correo y la contraseña de arriba (sólo cuentas de revisión; las demás entran con Google o liga
   mágica) y volver a pulsar Connect.
3. En la pantalla de consentimiento pulsa **Permitir**.
4. Datos que ya tiene la cuenta: archivos `customers-sample.csv` y `sample-gradient.png`, el documento
   «Quarterly sales summary (sample)», la base `sample_store` (tabla `customers`), el sitio
   «Sample site (EasyBits demo)» (`/s/claude-review-sample/`) con el formulario «Contact» y un envío de
   muestra, y el brand kit «Sample brand» (default).
5. Prompts sugeridos: «List my EasyBits files», «Query sample_store: top 3 customers by total_purchases»,
   «Show the submissions of my Contact form», «Create a one-page document titled Hello with my default
   brand kit and export it as PDF».

La cuenta está en plan gratis (Byte): ninguna tool del toolset `claude` cobra ni manda correo a
terceros (el aviso de envío de formulario sólo llega al dueño, que es esta misma cuenta).

### Self-test (2026-10-13)

Flujo OAuth real (login de revisor → DCR → PKCE S256 → `resource=/api/mcp/claude`), `initialize`,
`tools/list` (81) y `tools/call` de las 81 tools en prod; las destructivas sobre recursos creados en
la misma prueba. Arreglado de paso: `list_share_links` salía vacío sin `includeRevoked` (Mongo:
campo sin escribir ≠ `null`), `reorder_pages` devolvía `{"0":…,"1":…}` y
`extract_brand_kit_from_url` guardaba `logoUrl: "data:text/plain;base64,"` cuando el candidato no era
imagen. Token revocado al final (401) y cliente DCR temporal borrado.

## Pendiente

- Probar como conector propio en claude.ai y en MCP Inspector.
- Envío en el portal (lo hace bliss: casillas legales).
- Si se republica el registro MCP (`server.json`), decidir si el listado apunta a `/api/mcp/claude`.
