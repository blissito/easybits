# Pruebas pendientes — 26 sep 2026

Lo que cambió el 25 sep y conviene probar a mano.

## 1. Documents (reparado)
`gemini-2.5-pro` quedó retirado para la llave de Google del proyecto (404) y la generación,
el refinado y la regeneración de páginas estaban caídos en producción. Ahora:

| Operación | Modelo |
|---|---|
| Generar documento | `claude-sonnet-5` |
| Refinar, regenerar página, direcciones, autodescripción | `claude-haiku-4-5-20251001` |
| Clonar PDF (presentationClone / documentClone) | `claude-sonnet-5` (juez: Haiku) |

La AppConfig `ai-models` de producción ya tiene estos valores (el anterior está respaldado en la
sesión). Verificado: `POST /api/v2/document-generate` completo en producción.

Probar en `/dash/documents`: documento nuevo con direcciones, refinar un elemento, regenerar una
página, exportar PDF.

Siguen en Gemini Flash (tier gratuito, 20/día): `describe_image`, media entrante de WhatsApp y el
respaldo de transcripción de voz.

## 2. compare_render / skill `easybits-clone-verify`
- MCP `compare_render`, REST `POST /api/v2/render/compare`, SDK `@easybits.cloud/sdk@0.36.0`
  (`compareRender`).
- Skill: `npx skills add https://easybits.cloud` (también en `blissito/easybits-skills`).
- Blog: https://www.easybits.cloud/blog/skill-verifica-clones-pdf

## 3. Línea base del clonador
`npx tsx --tsconfig tsconfig.json scripts/clone-baseline.mts <pdf>:<pág> …` → hoy 0/3 pasan:
el texto casi siempre está, pero ninguna palabra queda en su lugar y dos páginas desbordan la hoja.
