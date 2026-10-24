# Referencias: aprobaciones móviles y memoria compartida (Ghosty Studio)

Kortix: `kortix-ai/suna` rama `dev`, commit `c679b16` (Elastic-2.0, sólo ideas).

## A) «Pregunta antes de actuar»: bandeja de aprobaciones

**Kortix**
- Tres respuestas: `once | always | reject` (`packages/ui/src/session/tool/inline-permission-reply.ts:1`). Si ya se contestó o expiró, la tarjeta se reactiva sin error (`:3-8`).
- «Permitir en esta sesión» se guarda por (sesión, conector, acción). Sólo puede ampliar de *preguntar* a *ejecutar*, nunca saltarse un bloqueo (`packages/db/migrations/20260704130000000_session_tool_approvals.sql:3-13`).
- Caducidad: 24 h por default, configurable de 5 min a 30 días. Caducar no reanuda nada (`apps/api/src/connectors/approval-expiry.ts:1-14`).
- La tarjeta enseña el contenido real: si la acción sólo nombra un objetivo («enviar borrador 123») lee el correo para mostrarlo, y la aprobación se liga a su hash: si cambia, vuelve a preguntar (`apps/api/src/connectors/approval-enrichers.ts:1-8`). En móvil: acción, vista previa de argumentos y riesgo (`apps/mobile/components/session/tool/tools/connector-tools.tsx:285-297`, `:197`).
- Al negar, el agente recibe «denied — continue without it» o la nota del aprobador (`apps/api/src/projects/lib/connector-approval-decision.ts:79-87`).
- Una sola bandeja «Needs you» por sesión, con una línea del tipo «Approve: (Gmail) Send Email · 2 more» (`apps/mobile/lib/session/needs-you.ts:22-52`). Una aprobación sólo ofrece aprobar/negar (`apps/mobile/lib/review/review-verdict.ts:54-61`).
- Lote sólo en web (`POST /review/bulk`); móvil lo excluye a propósito (`apps/mobile/components/pages/ReviewPage.tsx:9`).
- La misma tarjeta sale en Slack y Teams; al decidir en cualquier lado, los botones se reemplazan por el resultado (`apps/api/src/channels/approval-card-relay.ts:1-8`). El push dice «Kortix needs your approval to continue» (`apps/api/src/notifications/push-payload.ts:31`).

**Otros**
- **ChatGPT agent**: pide permiso antes de acciones con consecuencias y deja tomar el control ([OpenAI](https://openai.com/index/introducing-chatgpt-agent/)).
- **Lindy**: «Ask for Confirmation» por acción; aprueba por correo o desde la tarea; modo borrador ([docs](https://docs.lindy.ai/testing/human-in-the-loop)).
- **Zapier Human in the Loop**: espera configurable con recordatorio; al vencer, *terminar* o *continuar* ([help](https://help.zapier.com/hc/en-us/articles/38733184458765/)).
- **Intercom Fin**: escala por reglas (sentimiento negativo, VIP) o guías en lenguaje natural; sin humano disponible no ofrece escalar ([help](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)).

## B) Memoria compartida de la empresa

**Kortix**
- `memory/` vive en git: es el «cerebro» compartido por el equipo, con un índice `MEMORY.md` (`packages/starter/templates/base/memory/MEMORY.md:3-13`).
- Las sesiones escriben lo duradero, pero sólo llega a `main` como *change request* que revisa el humano («Don't merge your own CR») (`packages/starter/templates/managed/skills/kortix-memory/SKILL.md:40-42`, `:168-180`).
- Lo personal va a `/drives/me/Memory`; secretos y datos personales, al gestor de secretos (`SKILL.md:107-114`, `:224`).
- Un agente curador (`harness-reflector`) la ordena todos los días a las 03:00 (`packages/starter/templates/base/kortix.yaml:161-166`).
- En el chat, cada escritura sale como fila «Memory updated» que abre el archivo (`apps/mobile/lib/session/tools/projects-memory.ts:19-32`).

**Otros**
- **ChatGPT**: memorias guardadas (aviso «Memoria actualizada») + historial; se borran en ajustes; chat temporal sin memoria ([FAQ](https://help.openai.com/en/articles/8590148-memory-faq)).
- **Claude**: memoria por proyecto con resumen editable e incógnito ([Anthropic](https://www.anthropic.com/news/memory)); Projects suma archivos que sube el dueño ([soporte](https://support.anthropic.com/en/articles/9517075-what-are-projects)).
- **Mem0**: alcance `user_id`/`agent_id`/`run_id`; extracción automática con `infer`; eventos ADD/UPDATE/DELETE; borrado total exige filtros explícitos ([docs](https://docs.mem0.ai/core-concepts/memory-operations/delete), [blog](https://blog.mem0.ai/understanding-mem0s-add-operation)).
- **Letta**: bloques con etiqueta y límite que el agente edita; un bloque se comparte entre agentes ([docs](https://docs.letta.com/guides/agents/memory-blocks)).

## Qué copiar

**A, aprobaciones**
1. La tarjeta muestra **lo que va a pasar** (mensaje, monto, destinatario), no la tool; si cambia, se vuelve a pedir.
2. Tres botones grandes: **Sí, una vez · Sí, siempre para esto · No**. «Siempre» nunca desbloquea algo prohibido.
3. Caducidad visible (24 h) con regla al vencer; por default «no lo hago» y se avisa.
4. Al negar, el agente sigue sin esa acción con la nota del dueño («No, ofrécele 10 %»); el cliente nunca queda colgado.
5. Un pendiente vivo en push, WhatsApp y web: gana el primero y las demás dicen «Aprobado por Ana». Lote sólo en web.

**B, memoria**
1. Tres cajones: **empresa** (todos los agentes), **agente** (su oficio) y **cliente** (por contacto). 
2. Datos del cliente se guardan solos; reglas de empresa (precios, políticas, tono) entran como **propuesta que aprueba el dueño**.
3. Cada escritura se ve en la conversación («Recordé: …») con deshacer en un toque.
4. Página «Lo que sabe tu empresa» en lenguaje llano: editar, borrar y ver de dónde salió cada dato.
5. Nunca secretos, tarjetas ni contraseñas; un curador nocturno propone limpiezas y borrar todo exige doble confirmación.
