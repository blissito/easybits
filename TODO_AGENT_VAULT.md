# Agent Vault for EasyBits

Credential vault que permite a agentes AI usar servicios externos sin exponer API keys.
Inspirado en [OneCLI](https://github.com/onecli/onecli) (MIT, TypeScript, 1.7K stars) y validado en NanoClaw.

## Por que EasyBits necesita esto

EasyBits ya provee MCP servers a agentes. El paso natural es ser el gateway
por donde pasan las credenciales de esos agentes, no solo los archivos.
Un vault convierte a EasyBits en la capa de seguridad entre agentes y servicios,
lo cual es sticky y monetizable (cobras por request o por servicio conectado).

## Arquitectura propuesta

```
Agent (container) --> EasyBits Vault Proxy --> Servicio externo (OpenAI, Stripe, etc.)
                         |
                    - Inyecta credenciales por host+path match
                    - Aplica rate limits por agente/org
                    - Logea uso (tokens, costo, modelo)
                    - Aprueba/rechaza por policy
```

## Lo que ya existe (NanoClaw)

En `nanoclaw/src/credential-proxy.ts` ya implementamos:

1. **Per-group rate limiting** — sliding window counter, configurable por grupo
2. **Usage logging** — ring buffer de 500 entries con tokens, modelo, costo, duración
3. **Policy enforcement** — bloqueo, modelo permitido, límite de input tokens
4. **Endpoints internos**:
   - `GET /nanoclaw/vault/usage?group=X` — consultar uso
   - `POST /nanoclaw/vault/policy` — cambiar policy en caliente
5. **Header-based routing** — `X-NanoClaw-Group` identifica al agente

Esto cubre Anthropic API. EasyBits lo generalizaría a cualquier servicio.

## Lo que EasyBits debe agregar

### P0 — MVP (1-2 semanas)
- [ ] Proxy HTTP genérico que matchea por `host + path pattern`
- [ ] Tabla `vault_credentials`: `{ org_id, service_name, host_pattern, path_pattern, credential_header, credential_value_encrypted }`
- [ ] Inyección automática: si el request matchea host+path, inyecta el header/token correspondiente
- [ ] Rate limit por org + servicio (reusar el sliding window de NanoClaw)
- [ ] Dashboard de uso: requests, tokens, costo estimado por servicio

### P1 — Policies (2-3 semanas)
- [ ] Policy engine: `{ allow, deny, rate_limit, require_approval }` por servicio/org/agente
- [ ] Allowlist de endpoints (ej: permitir `POST /v1/messages` pero no `DELETE /v1/files/*`)
- [ ] Time-bound access: credenciales que expiran (ej: "acceso a Stripe por 1 hora")
- [ ] UI en dashboard para configurar policies visualmente

### P2 — HITL y Audit (3-4 semanas)
- [ ] Human-in-the-loop: acciones peligrosas requieren aprobación (webhook/email/WhatsApp)
- [ ] Audit log persistente: quién usó qué, cuándo, resultado
- [ ] Cost alerts: notifica cuando un org supera X USD/día
- [ ] Exportar usage a CSV/API para billing

### P3 — SDK y Marketplace
- [ ] SDK: `easybits.vault.connect('stripe', { apiKey: '...' })` — onboarding en 1 línea
- [ ] Marketplace de conectores pre-configurados (Stripe, OpenAI, Twilio, SendGrid, etc.)
- [ ] Credential rotation automática
- [ ] Multi-tenant: cada cliente de EasyBits tiene su vault aislado

## Insights de OneCLI (leer su código)

**Repo**: https://github.com/onecli/onecli

Lo valioso que se puede copiar/adaptar:

1. **Host+path matching** — su `CredentialRouter` matchea requests por dominio y path regex.
   Mucho más flexible que nuestro approach de "solo Anthropic". Ver `src/router/`.

2. **Policy DSL** — definen policies como JSON declarativo:
   ```json
   { "service": "stripe", "method": "DELETE", "action": "require_approval" }
   ```
   Más mantenible que if/else chains.

3. **Credential encryption at rest** — usan libsodium sealed boxes. No AES custom.
   EasyBits ya tiene Prisma+Postgres, agregar un campo encrypted es trivial.

4. **Request/response logging sin buffering excesivo** — loguean metadata (status, tokens, duration)
   pero no el body completo. Importante para no reventar memoria con responses grandes.

5. **Lo que NO copiar**: su UI/auth layer es overengineered para nuestro caso. EasyBits ya tiene
   auth y dashboard. Solo necesitamos el proxy core + policy engine.

## Monetización

- **Free tier**: 1,000 proxied requests/mes, 1 servicio conectado
- **Pro**: 50,000 requests/mes, unlimited servicios, policies, audit log
- **Enterprise**: unlimited, HITL approvals, SSO, dedicated proxy

Encaja perfecto con el pricing existente de EasyBits (storage + compute + vault).

## Links

- OneCLI repo: https://github.com/onecli/onecli
- NanoClaw blog post: https://nanoclaw.dev/blog/nanoclaw-agent-vault
- NanoClaw implementation: `nanoclaw/src/credential-proxy.ts` (vault features at top of file)
- Anthropic tool use security: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/security
