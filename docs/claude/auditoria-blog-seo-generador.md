# Auditoría: blog vs SEO vs posicionamiento como generador full-stack (2026-10-16)

Pregunta: ¿el blog y el SEO de easybits.cloud ayudan a vender `/dash/sitios` como «un Lovable»?
Respuesta corta: **no, y hoy no pueden**. El generador no existe para nadie que no tenga cuenta.

## 1. El generador es invisible desde fuera

| Superficie | ¿Menciona Sitios / «crea tu app»? |
|---|---|
| Home (`/`) | No. Título: «Tu agente de IA en producción. Un MCP todo en uno» |
| `/planes`, `/funcionalidades`, `/hosting` | No (0 menciones de «sitios», «generador», «sin programar») |
| `/sitios`, `/crear-sitios` | 404 |
| Sitemap | Sin ninguna URL del generador |
| Blog (45 posts) | 0 posts sobre el generador; 0 menciones de Lovable/Bolt/v0 |
| `llms.txt` | 1 mención de «sitios» |

Lo que sí existe y está probado (7 stacks, vista previa en vivo, base + login con Better Auth,
publicar a caja propia) no tiene ni una página indexable.

## 2. Bugs de SEO técnico (arreglables hoy)

1. **El sitemap sólo lista 10 de 45 posts.** `BlogSEOService.generateSitemap()` llama
   `BlogDataService.getAllPosts()` sin `limit` y la paginación trae 10 por defecto
   (`app/.server/blog/seo.ts:255`). 35 posts —incluidos los de sandboxes, el pilar— nunca
   llegaron al sitemap. Fix: pasar un `limit` alto o leer `MDXProcessor.getAllPosts()` directo.
2. **URLs del sitemap que dan 301.** `/blog`, `/planes` y `/funcionalidades` redirigen a la versión
   con slash final, y esas páginas **no tienen `<link rel="canonical">`** (sí lo tienen `/` y
   `/hosting`). Google recibe la URL «buena» del sitemap como redirección. Fix: canonical en las
   tres y que sitemap y canonical usen la misma forma.
3. **Blog index titulado «La nube para expertos IA»** — tercera variante de tagline (home dice
   «Tu agente de IA en producción», CLAUDE.md dice «La nube para agentes de IA»).

## 3. El blog le habla a otro público

- **39 de 45 posts** son infraestructura para quien ya construye agentes (sandboxes, eve, MCP,
  firewall, kernel, bubblewrap). Buenos para el integrador técnico; cero intención de búsqueda de
  «crear una app con IA».
- **6 posts de enero 2025** («marketing para creadores», «monetizar conocimiento») son del producto
  viejo de assets digitales: diluyen el tema del dominio. Candidatos a `noindex` o a redirigir.
- Los títulos son ingeniosos («La conversación envenenada», «El arnés ya es gratis») pero no
  coinciden con lo que alguien teclea. Buenos para compartir, malos para buscar.

## 4. Mercado: dónde cabe EasyBits frente a Lovable

Lovable (oct 2026): Pro **USD 25/mes**, 100 créditos, Supabase cobrado aparte; desde agosto unifica
créditos de build, Cloud y llamadas de IA. Bolt: Pro desde USD 25, varios frameworks. Contenido en
español: casi todo son reseñas de terceros (banani, clickup, substacks); **nadie ofrece pesos, CFDI
ni hosting en México**.

No conviene reposicionar la marca entera como «el Lovable mexicano»: la ventaja defendible es la
caja (lo dicen la auditoría del 5-sep y `docs/estrategia/`). Conviene **un pilar más**, con ángulo
propio:

- **Precio en MXN, todo incluido**: build + base + login + hosting en una factura (Lovable cobra
  Supabase aparte y en dólares).
- **Código real en tu stack** (Next, TanStack, React Router, Nuxt, SvelteKit, Astro, Remix): no un
  lock-in de plantilla.
- **Máquina propia con respaldos diarios y rollback**, no una preview que se borra.
- **Y luego le pones agente/WhatsApp** — lo que Lovable no tiene.

⚠️ Revisar antes de publicar precio: `/hosting` dice «desde $49/mes» y el botón del editor dice
«Publicar · $299/mes». Un comprador que compare las dos páginas lo va a notar.

## 5. Plan sugerido (por impacto/esfuerzo)

1. **Hoy**: fix del sitemap (10→45) y canonicals en `/blog`, `/planes`, `/funcionalidades`.
2. **Esta semana**: landing pilar `/crear-app` (o `/sitios`) sobre `ProductPage.tsx`, con precio
   derivado, ejemplos reales (`/s/rayo-creciente`) y entrada en footer, sitemap y `/planes`.
3. **Contenido con intención de búsqueda** (3–5 posts): «Alternativa a Lovable en pesos»,
   «Lovable vs Bolt vs EasyBits», «Crear una app con login y base de datos con IA», «De prompt a app
   con dominio propio en México», «Cuánto cuesta de verdad una app hecha con IA (Supabase incluido)».
   Cada uno enlaza a la landing pilar.
4. **Limpieza**: `noindex`/redirect de los 6 posts de creadores 2025; unificar tagline.
5. **Medir**: ya existe `/dash/admin/blog`; falta Search Console para saber qué búsquedas entran.

Fuentes de mercado: eesel.ai/blog/lovable-pricing · banani.co/blog/lovable-pricing-and-credits ·
banani.co/es/blog/lovable-review · clickup.com/es-ES/blog/496032/lovable-vs-bolt
