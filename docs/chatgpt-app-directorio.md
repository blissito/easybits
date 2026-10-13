# EasyBits en el directorio de apps de ChatGPT (2026-10-13)

Mismo MCP que el conector de Claude: **`https://www.easybits.cloud/api/mcp/claude`** (toolset strict,
sin generación de imagen/video/audio, sin cobros, cajas, flota ni secretos; ver
[conector-claude-directorio.md](conector-claude-directorio.md)). Sin widgets. Nada enviado a OpenAI.
Referencia de requisitos: `~/ghosty-studio/docs/claude/chatgpt-app-directorio.md`.

## Qué hay en el código

| Requisito de OpenAI | Dónde |
|---|---|
| Verificación de dominio: `/.well-known/openai-apps-challenge` lee `OPENAI_APPS_CHALLENGE` (404 si falta) | `app/routes/api/wellknown/openai-apps-challenge.ts` |
| `iss` (RFC 9207) en toda vuelta del authorize + `authorization_response_iss_parameter_supported` | `app/routes/oauth/authorize.tsx`, `oauth-authorization-server.ts` |
| `issuer` = `authorization_servers` de la metadata del recurso (`https://www.easybits.cloud`) | ya era así |
| DCR (ChatGPT registra `https://chatgpt.com/connector_platform_oauth_redirect` solo), PKCE S256, `resource` | igual que Claude |
| `readOnlyHint`, `destructiveHint` y `openWorldHint` explícitos en todas | `app/.server/mcp/toolAnnotations.ts` |

## Lo que hace bliss en el portal (platform.openai.com → Apps)

1. Verificar la organización si no está.
2. Crear la app con MCP `https://www.easybits.cloud/api/mcp/claude`, auth OAuth → **DCR**.
3. Copiar el token del dominio: `fly secrets set OPENAI_APPS_CHALLENGE=<token>`; comprobar con
   `curl https://www.easybits.cloud/.well-known/openai-apps-challenge` y darle «Verify».
4. Conectar desde ChatGPT (modo desarrollador) con la cuenta de revisor y correr los 8 casos.
5. Grabar el video con los 5 positivos, subirlo no listado y pegar la liga.
6. Review details: `claude-review@easybits.cloud` + contraseña (entra por `/login/revisor`, sin MFA ni
   liga mágica; la genera `scripts/seed-claude-reviewer.ts`). Enviar.

## Paquete para el formulario

- **Name**: EasyBits
- **Short description**: Create documents, PDFs and websites, manage your files and SQL databases, and research the web from ChatGPT.
- **Long description**: EasyBits (easybits.cloud) is a cloud workspace for AI agents. This app gives ChatGPT your EasyBits account: upload and organize files served from a CDN, create and edit multi-page documents and export them as PDF, publish websites and landing pages with your brand kit, collect submissions with forms, and keep structured data in SQLite databases you can query with SQL. It can also search the web, read pages and extract structured records. Everything is saved in your account, so you can share it with a link or keep editing it in EasyBits. Sign-in uses your EasyBits account through OAuth; the app only sees what your account sees, and you can disconnect it at any time.
- **Category**: Productivity (alternativa: Developer tools)
- **Website** https://www.easybits.cloud · **Support** mailto:soporte@easybits.cloud · **Privacy** https://www.easybits.cloud/aviso-de-privacidad · **Terms** https://www.easybits.cloud/terminos-y-condiciones
- **Example prompts**: «List my EasyBits files» · «Create a database with my customers from this CSV and show the top 10» · «Make a one-page PDF flyer with my brand kit».

### Casos positivos (cuenta `claude-review@easybits.cloud`)

| # | Escenario | Prompt | Tools esperadas | Resultado esperado |
|---|---|---|---|---|
| 1 | Ver mis archivos | «List my EasyBits files» | `list_files` | Lista con nombre, tamaño y fecha |
| 2 | Datos a respuestas | «Create a database called demo with a customers table, add 3 customers and show them» | `db_create`, `db_query`, `db_select` | Base creada y las 3 filas |
| 3 | Documento a PDF | «Create a one-page document titled "Hello EasyBits" and export it as PDF» | `create_document`, `export_document` | Liga al PDF |
| 4 | Investigar | «Search the web for the top 3 coworking spaces in Guadalajara and summarize them» | `web_search`, `web_fetch` | Resumen con fuentes |
| 5 | Publicar | «Publish a simple landing page called demo-landing with a contact form and give me the URL» | `create_website`, `create_form`, `deploy_website_file` | URL pública del sitio |

### Casos negativos

| # | Prompt | Por qué no debe actuar | Respuesta esperada |
|---|---|---|---|
| 1 | «What's the weather in Mexico City?» | No es de EasyBits | No llama tools |
| 2 | «Generate an AI image of a cat for my landing» | Esta app no genera imágenes | Lo dice; a lo más ofrece `search_stock_photo` |
| 3 | «Upgrade my EasyBits plan» | La app no vende ni cambia planes | Explica que se hace en easybits.cloud; a lo más `get_usage_stats` |

### Anotaciones (por si el escaneo pide aclarar)

- **readOnly** (`list_*`, `get_*`, `search_*`, `describe_image`, `db_select`, `web_fetch`, `web_search`…): sólo leen la cuenta o la web.
- **destructive** (`delete_*`, `update_*`, `set_*_html`, `replace_html`, `patch_node`, `db_query`, `deploy_website_file`, `inject_html`…): borran o sobrescriben; ChatGPT pide confirmación.
- **openWorld** (`web_*`, `research_*`, `screenshot_url`, `audit_page`, `search_stock_photo`, `search_icon`, `extract_brand_kit_from_url`, `deploy_*`, `create_share_link`, `create_form`): leen internet o publican algo que cualquiera puede abrir.

### Assets

- Ícono 512 px: `public/brand/favicon-512.png` (también `public/brand/isotipo.svg`). Variante oscura: pendiente (opcional).
- Video de recorrido: pendiente (bliss, con los 5 positivos).
- ⚠️ Revisar que el aviso de privacidad diga retención y controles del usuario para apps conectadas (§5 bis cubre tokens y revocación; la retención general está fuera de esa sección).
- Sin «MCP» en el nombre, sin precios en la descripción (cumple).
