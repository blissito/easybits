# Feedback del CLI `easybits`: entrega de Acali en 6 máquinas nano (29 sep 2026)

Ejercicio: poner Acali (React Router v7 + SQLite, ~19k alumnos) en 6 máquinas nano de la cuenta de
Brenda (`clave`, `clave-verano`, `clave-nocturna`, `aguas`, `aguas-verano`, `aguas-nocturna`), cada
una con su slug `<x>.easybits.cloud`, su base en el sqld del fierro y deploy desde un solo repo.
Regla: todo lo de EasyBits **sólo con el CLI**. Cada fila es algo que el CLI no cubría, cubría mal o
en lo que la plataforma falló. Arranqué con la 0.5.1 instalada; terminé en la 0.14.1.

## Fricciones

| # | Área | Qué pasó | Propuesta / estado |
|---|---|---|---|
| 1 | Versión | Tenía la 0.5.1 instalada y la de npm era la 0.13.0; no vi aviso. | Que `doctor` y cualquier comando de una versión vieja lo digan en rojo. |
| 2 | Crear máquina | No existía `machines create/launch`: sólo la API; `easybits init` imprime un `curl`. | ✅ 0.14.0: `machines launch` (`--repo` / `--archive <url\|archivo>` / `--machine`, `--tier`, `--prebuilt`, `--env`, `--secret`, `--data`, `--domain`). |
| 3 | Nombres | `launch --machine clave` pedía el id. | ✅ 0.14.1: acepta nombre. |
| 4 | Secretos por máquina | El vault es por (dueño, nombre): 6 apps de una cuenta compartían `JWT_SECRET`/`FACTURAPI_KEY`. | ✅ server `73997358`: `NOMBRE__M_<id>`, primero el de la máquina y luego el global; `redeploy` los copia. |
| 5 | Secretos al crear | La máquina no existe antes del `launch`, así que no hay dónde guardar secretos; si los declaro con `--secret`, el primer arranque falla. | `launch --dotenv -` que guarde los secretos con alcance de la máquina recién creada ANTES de arrancar. |
| 6 | Relanzar borra config | `launch --machine x --env TZ=…` reemplazó TODO el `env` (se fueron `DATABASE_URL`, `APP_URL`…). | ✅ server `8cfeaf1c`: `env` se mezcla por llave. Falta `--unset-env K` para quitar una. |
| 7 | Rollback borra secretos | Un `launch` fallido vuelve solo al release anterior con SU runspec; ése era anterior a los secretos → la app no arrancó más ("JWT_SECRET es obligatorio"). | ✅ server `8cfeaf1c`: el rollback conserva los `secretNames` actuales. |
| 8 | Todo redeploy fallaba (`exit -1`, sin salida) | `react-router-serve` atiende SIGTERM con `server.close()` y espera las conexiones keep-alive del proxy; systemd lo aguantaba 90 s y el exec de arranque también dura 90 s. | ✅ server `7826a774`: `TimeoutStopSec=10` + stop con tope de 15 s y `kill -9`. Falta: que un timeout diga «timeout del arranque (90 s)» en vez de `exit -1` vacío. |
| 9 | Cobro | Cuenta con plan Tera (dado a mano) → `launch` devolvió un checkout de Stripe **en vivo** por máquina: busca una suscripción real. | Se marcó `courtesyHosting` en la DB. Propuestas: que el error diga por qué (sin suscripción activa), que `usage` muestre si el hosting es cobrable, y separar `billing: courtesy` (gratis) de `invoiced` (se cobra por fuera, como Acali; Google Cloud lo llama *invoiced billing account*). Además `launch` subió el archivo antes de pedir el pago. |
| 10 | Slug `<x>.easybits.cloud` para una app | No existe: CNAME a mano en Route53 → `cname.sandboxes.easybits.cloud` + `domains add`. | `machines launch --slug x` / `domains add --slug x` que cree el registro y valide que no choque con un Website. |
| 11 | DB del fierro | `easybits db` apunta al sqld de Fly; el del fierro (el bueno) sólo por el passthrough desde la caja. No hay forma de ver namespaces, tamaño ni respaldos desde el CLI. | `db` sobre el sqld del fierro (reemplazo de `easybits-db`), con `db ls` mostrando namespaces de las máquinas y su último respaldo. |
| 12 | Límite del sqld | `RESPONSE_TOO_LARGE` al leer una tabla de 53k filas; y su parser rechaza `group_concat(x, sep ORDER BY …)` (SQLite lo acepta). | Documentar ambos en hosting/db. |
| 13 | Memoria en nano | La app moría por OOM y el CLI no lo dice: lo vi con `dmesg` por `sb exec`. Presupuesto real: ~106 MB libres con la app arriba. | `machines logs --oom` o `machines doctor` con kills del kernel, RSS y memoria disponible; documentar el presupuesto real de nano. |
| 14 | Caja colgada | Bajo presión de memoria, `sb exec` devuelve 409 `SandboxUnreachable` por minutos. | Que el mensaje sugiera «probable OOM» y `machines restart`. |
| 15 | `sb exec` con comillas | Pasar una URL firmada (`&`, `'`) rompía el quoting. | `sb exec --script -` (stdin) para no pelear con el shell. |
| 16 | `sb exec --timeout 1500` | `API error 400: Invalid body`, sin decir el máximo. | Validar en el CLI y decir el máximo (600). |
| 17 | `machines logs --grep -i` | «argument is ambiguous». | `--grep` acepta regex / `-i`. |
| 18 | `files upload` público | No hay `--public`; `launch --archive` lo hace por dentro. | `files upload --public`. |
| 19 | SDK | `EasybitsFile` no declara `url` (la API sí la manda). | Agregar `url?` al tipo. |
| 20 | Publicar la CLI | Tras `npm publish`, `npm i -g …@0.14.1` daba ETARGET 1–2 min. | El script de release espera al registry. |
| 21 | `domains add` | La sugerencia de `verify` imprime el sandboxId, no el nombre. | Imprimir el nombre que usó el usuario. |
| 23 | Deploy de EasyBits mata `launch` en curso | En CI, `launch` respondió `API error 502: empty response`: un push a `main` de EasyBits redeployó el server en Fly a la mitad (502 a las 22:02:19, deploy terminó 22:02:54). El release quedó `pending` para siempre (nadie lo marca `failed`) y bloqueó 10 min los reintentos con `ReleaseInProgress`; cada reintento regresó la máquina a la versión anterior. | Apagado ordenado del server (esperar requests largos o reanudarlos), marcar `failed` los `pending` huérfanos al arrancar, y `launch` asíncrono (`machines wait`). Mientras: reintentos en el workflow del cliente. |
| 22 | Webhooks de Facturapi | (No es EasyBits) La cuenta del cliente no tiene suscripción: 402. | Pendiente del cliente. |

## Lo que sí funcionó bien

- `machines launch --archive build.tgz --prebuilt` + GitHub Actions con matriz: el build en el runner
  (la nano no compila) y 6 deploys en paralelo.
- `domains add` + Caddy on-demand: certificado en la primera visita.
- `machines secrets set --dotenv -` por stdin (con el arreglo #4).
- Respaldos de la flota: diario con ensayo de restauración (verificado en el fierro).

## Veredicto

Con 0.14.1 y los tres arreglos del server, el CLI alcanza para **alta y deploy** de apps reales.
Quedan fuera del CLI: slug propio (#10), la base del fierro (#11), diagnóstico de memoria (#13) y
secretos al crear (#5). Prioridad sugerida: #13 (sin eso, un OOM se ve como «la caja no responde»),
#5, #10, #11.
