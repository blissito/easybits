# Secuencias

Producto de email marketing **bilateral**: cada usuario crea/administra sus secuencias y se suscribe a las de otros (follow estilo Twitter). Marca: "Secuencias".

## Rutas

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/secuencias` | `routes/secuencias.tsx` | Hub: Mis Secuencias · Suscripciones · Descubrir · Config |
| `/secuencias/:id` | `routes/secuencias.$id.tsx` | Gestión (dueño): tabs Emails (riel) · Suscriptores · Ajustes |
| `/s/:id` | `routes/s.$id.tsx` | Landing pública de suscripción (anti-bot + doble opt-in) |
| `/s/confirmar` | `routes/s.confirmar.tsx` | Confirma el doble opt-in → crea enrollment |
| `/s/video` | `routes/s.video.tsx` | Reproductor con desbloqueo por avance (token o cookie) |
| `/s/baja` | `routes/s.baja.tsx` | Cancelar suscripción (link footer + one-click POST) |
| `/api/ai.email` | streaming markdown (Haiku) para generar el cuerpo |
| `/api/email-image` · `/api/extract-text` · `/api/sequence-video` | subir imagen · extraer texto de contexto (md/txt/PDF) · subir video |

## Modelo (`prisma/schema.prisma`)
- **`Sequence`**: `ownerId` (null = oficial), `isActive`, `emails[]`, `enrollments[]`.
- **`SequenceEmail`**: `order`, `subject`, `content` (HTML), `delayDays`/`specificDate`, `videoSlug?`.
- **`SequenceEnrollment`** (fila por suscriptor+secuencia): `currentEmailIndex`, `status` (active/paused/completed), `nextEmailAt`, arrays SES (`delivered/opened/clicked/bounced`), `videosWatched`.

## Motor de envío (`app/.server/sequences.ts`)
- `processDueEnrollments()` corre por cron **agenda** (`agenda.ts`, job `process_sequences`, cada 5 min en prod; arranca en `entry.server.tsx` salvo `DISABLE_CRON=true`).
- Manda con `sendSESTEST` desde **`SEQUENCE_FROM` = "FixterGeek <secuencias@fixtergeek.com>"** (dominio verificado en SES) + tags (`sequence_id`/`enrollment_id`/`sequence_email_id`) + header `List-Unsubscribe`.
- Inyecta por suscriptor: botón **"▶ Ver el video"** (`{{video}}` o al final) y link de **baja** (`{{unsubscribe}}`), ambos tokenizados.
- Timing = `calculateNextEmailDate` (delay relativo al email anterior; el #1 desde la suscripción).

## Composición (drawer en `secuencias.$id.tsx`)
- **Riel vertical** (estilo Loops): Trigger → conectores con espera → nodos email → "Fin". `+` inserta en posición; click abre el **drawer**.
- Drawer: asunto, **timing con ancla**, **Generar con IA en streaming** (aparece en el preview), contexto opcional (pegar/PDF, sin almacenar), **video** (seleccionar existente o **subir** — `Video` se crea al guardar, sin huérfanos), preview, **Enviar prueba**. Cierra con ESC/dirty-guard; confetti al suscribirse.

## Email shell (`app/utils/emailShell.ts`)
`wrapEmailHtml()` (estilos inline, email-safe) + `emailButton()`. Footer: microfooter CTA ("¿Quieres crear una secuencia como esta?") + link "Cancelar suscripción".

## Tokens (`app/utils/tokens.ts`)
`generateSequenceSubscribeToken` (doble opt-in, 7d) · `generateSequenceVideoToken` (90d) · `generateSequenceUnsubscribeToken` (365d). Todos JWT con `process.env.SECRET`.

## Anti-bot (`app/.server/anti-bot.ts`)
`checkSignupEmail()` bloquea dominios desechables (`disposable-email-domains` + `CUSTOM_DISPOSABLE`) y gmail con 3+ puntos. Aplicado en todos los signups públicos. Si bloqueado → finge éxito, no crea. **Importante:** el doble opt-in solo no basta (bandejas desechables auto-confirman) — ver `docs/sequences-tracking.md` para el tracking SES.

## Pendiente
- Reenvíos desde el modal del suscriptor.
- Confirmar tracking open/click en prod con envío real.
- Ramas/condiciones (v2: grafo + motor + tracking por-email) e integración del editor visual de easybits.
