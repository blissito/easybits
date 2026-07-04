import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  // public tienda
  // index("routes/tienda.tsx"),
  route("/inicio?", "routes/home/home.tsx"), // this is gold ⭐️
  // public assetLanding
  ...prefix("tienda", [
    index("routes/assets/publicStore.tsx"),
    route(":assetSlug", "routes/assets/PublicCustomLanding.tsx"),
  ]),

  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login/:success?", "routes/login.tsx"),
  route("/logout", "routes/logout.tsx"),
  route("/preview", "routes/preview.tsx"),
  route("/onboarding", "routes/onboarding/onboarding.tsx"),
  route("/planes", "routes/planes.tsx"),
  route("/funcionalidades", "routes/funcionalidades.tsx"),
  route("/cuanto-cuesta-mi-agente", "routes/cuanto-cuesta-mi-agente.tsx"),
  route("/developers", "routes/developers.tsx"),
  route("/brand", "routes/brand.tsx"),
  route("/mcp", "routes/mcp-page.tsx"),
  route("/mcp/apps", "routes/mcp-apps.tsx"),
  route("/mcp/apps/:appName", "routes/mcp-apps-demo.tsx"),
  route("/docs", "routes/docs.tsx"),
  route("/status", "routes/status.tsx"),
  route("/blog", "routes/blog.tsx"),
  route("/blog/:slug", "routes/blog.$slug.tsx"),
  route("/sitemap.xml", "routes/sitemap.xml.tsx"),
  route("/robots.txt", "routes/robots.txt.tsx"),
  route("/llms.txt", "routes/llms.txt.ts"),
  route("/terminos-y-condiciones", "routes/terminos.tsx"),
  route("/aviso-de-privacidad", "routes/aviso.tsx"),
  // public video link @todo revisit private only? tokens?
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed share
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
  // AI Chat
  route("/ai-chat", "routes/ai-chat.tsx"),
  // POC público: visualización de la flota (cajas + agentes) con textura de fieltro
  route("/flota-poc", "routes/flota-poc.tsx"),

  // user dash
  ...prefix("dash", [
    route("compras/:assetId", "routes/purchase_detail.tsx"),
    route("compras/:assetSlug/review", "routes/assets/ReviewAsset.tsx"),
    layout("components/DashLayout/DashLayout.tsx", [
      index("routes/dash-redirect.tsx"),
      route("estadisticas", "routes/stats.tsx"),
      ...prefix("assets", [
        index("routes/assets/assets.tsx"),
        route(":assetId/edit", "routes/assets/EditAsset.tsx"),
        // Book editor
        route(":assetId/book-editor", "routes/dash/assets/book-editor.tsx"),
        route(":assetId/book-editor/:chapterId", "routes/dash/assets/book-chapter.tsx"),
      ]),
      route("tienda", "routes/store.tsx"),

      route("ventas", "routes/sales.tsx"),
      route("clientes", "routes/clients.tsx"),

      route("compras", "routes/purchases.tsx"),
      // Presentations
      ...prefix("presentations", [
        index("routes/dash/presentations/list.tsx"),
        route("new", "routes/dash/presentations/new.tsx"),
        route(":id", "routes/dash/presentations/editor.tsx"),
      ]),
      // Landings
      ...prefix("landings", [
        index("routes/dash/landings/list.tsx"),
        route("new", "routes/dash/landings/new.tsx"),
        route(":id", "routes/dash/landings/editor.tsx"),
      ]),
      // Landings v2
      ...prefix("landings2", [
        index("routes/dash/landings2/list.tsx"),
        route("new", "routes/dash/landings2/new.tsx"),
        route(":id", "routes/dash/landings2/editor.tsx"),
      ]),
      // Landings v3
      ...prefix("landings3", [
        index("routes/dash/landings3/list.tsx"),
        route("new", "routes/dash/landings3/new.tsx"),
        route(":id", "routes/dash/landings3/editor.tsx"),
      ]),
      // Landings v4
      ...prefix("landings4", [
        index("routes/dash/landings4/list.tsx"),
        route("new", "routes/dash/landings4/new.tsx"),
        route(":id", "routes/dash/landings4/editor.tsx"),
      ]),
      // Documents
      ...prefix("documents", [
        index("routes/dash/documents/list.tsx"),
        route("new", "routes/dash/documents/new.tsx"),
        route("directions", "routes/dash/documents/directions.tsx"),
        route(":id", "routes/dash/documents/editor.tsx"),
      ]),
      // Videos
      ...prefix("videos", [
        index("routes/dash/videos/list.tsx"),
        route("new", "routes/dash/videos/new.tsx"),
        route(":id", "routes/dash/videos/detail.tsx"),
      ]),
      route("characters", "routes/dash/characters.tsx"),
      route("brand-kits", "routes/dash/brand-kits.tsx"),
      route("packs", "routes/dash/packs.tsx"),
      route("archivos", "routes/files.tsx"),
      route("chime-poc", "routes/dash/chime-poc.tsx"),
      route("perfil", "routes/profile/profile.tsx"),
      // Hosting — máquinas permanentes + sandboxes
      route("hosting", "routes/dash/hosting/machines.tsx"),
      route("hosting/wa/:id", "routes/dash/hosting/wa.tsx"),
      // FleetAgents de WhatsApp ("Líneas") — superficie Baileys + workers efímeros
      route("flota", "routes/dash/fleet-agents.tsx"),
      // Poll resiliente del HUD de la flota (JSON, no tumba la página en deploys)
      route("flota/poll", "routes/dash/fleet-agents.poll.tsx"),
      // Cuentas de clientes — roster + "operar como" (impersonation)
      route("cuentas", "routes/dash/cuentas.tsx"),
      // Email — audiencia + newsletters
      route("email", "routes/dash/email/email.tsx"),
      // Developer dashboard
      layout("routes/dash/developer/developer.tsx", [
        ...prefix("developer", [
          index("routes/dash/developer/keys.tsx"),
          route("files", "routes/dash/developer/files.tsx"),
          route("llm", "routes/dash/developer/llm.tsx"),
          route("providers", "routes/dash/developer/providers.tsx"),
          route("setup", "routes/dash/developer/setup.tsx"),
          route("mcp", "routes/dash/developer/mcp.tsx"),
          route("websites", "routes/dash/developer/websites.tsx"),
          route("workspaces", "routes/dash/developer/workspaces.tsx"),
          route("webhooks", "routes/dash/developer/webhooks.tsx"),
          route("databases", "routes/dash/developer/databases.tsx"),
          route("domains", "routes/dash/developer/domains.tsx"),
          route("secrets", "routes/dash/developer/secrets.tsx"),
          route("payments", "routes/dash/developer/payments.tsx"),
        ]),
      ]),
      // Admin dashboard
      layout("routes/dash/admin/admin.tsx", [
        ...prefix("admin", [
          index("routes/dash/admin/users.tsx"),
          route("certs", "routes/dash/admin/certs.tsx"),
          route("metrics", "routes/dash/admin/metrics.tsx"),
        ]),
      ]),
    ]),
  ]),
  route("/edicion", "routes/store/storeEdition.tsx"),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // MCP
  route("api/mcp", "routes/api/mcp.ts"),
  // SSE
  route("api/sse/files", "routes/api/sse/files.ts"),
  // Cron
  route("api/cron/purge-files", "routes/api/cron/purge-files.ts"),
  route("api/cron/purge-machines", "routes/api/cron/purge-machines.ts"),
  route("api/cron/backup-agents", "routes/api/cron/backup-agents.ts"),
  route("api/cron/purge-certs", "routes/api/cron/purge-certs.ts"),
  route("api/cron/purge-keys", "routes/api/cron/purge-keys.ts"),
  route("api/cron/reap-embed-agents", "routes/api/cron/reap-embed-agents.ts"),
  route("api/cron/purge-notifications", "routes/api/cron/purge-notifications.ts"),
  // Webhooks (inbound from external providers)
  route("api/webhooks/mercadopago", "routes/api/webhooks/mercadopago.ts"),
  // Unsubscribe (public)
  route("u/unsubscribe", "routes/u.unsubscribe.tsx"),
  // Health
  route("api/health", "routes/api/health.ts"),
  // v2
  ...prefix("api/v2", [
    route("agents", "routes/api/v2/agents.ts"),
    route("agents/ghosty", "routes/api/v2/agents-ghosty.ts"),
    route("agents/autonomous", "routes/api/v2/agents-autonomous.ts"),
    route("agents/lookup", "routes/api/v2/agents-lookup.ts"),
    route("studio/ingest", "routes/api/v2/studio-ingest.ts"),
    route("calls", "routes/api/v2/calls.ts"),
    route("calls/files", "routes/api/v2/calls.files.ts"),
    route("calls/:id/record", "routes/api/v2/calls.$id.record.ts"),
    route("calls/:id/stop", "routes/api/v2/calls.$id.stop.ts"),
    route("calls/:id/list", "routes/api/v2/calls.$id.list.ts"),
    route("calls/:id/status", "routes/api/v2/calls.$id.status.ts"),
    route("calls/:id/files", "routes/api/v2/calls.$id.files.ts"),
    route("calls/:id/destroy", "routes/api/v2/calls.$id.destroy.ts"),
    route("agents/:id", "routes/api/v2/agent.ts"),
    route("agents/:id/message", "routes/api/v2/agent-message.ts"),
    route("agents/:id/lost", "routes/api/v2/agent-lost.ts"),
    route("agents/:id/extend", "routes/api/v2/agent-extend.ts"),
    route("agents/:id/suspend", "routes/api/v2/agent-suspend.ts"),
    route("agents/:id/resume", "routes/api/v2/agent-resume.ts"),
    route("agents/:id/whatsapp/status", "routes/api/v2/agent-whatsapp-status.ts"),
    route("agents/:id/whatsapp/link", "routes/api/v2/agent-whatsapp-link.ts"),
    route("agents/:id/whatsapp/unlink", "routes/api/v2/agent-whatsapp-unlink.ts"),
    // FleetAgent — superficie WhatsApp always-on que rutea a workers efímeros
    route("fleet-agents", "routes/api/v2/fleet-agents.ts"),
    route("fleet-agents/wa-action", "routes/api/v2/fleet-agents.wa-action.ts"),
    route("fleet-agents/:fleetAgentId/delete", "routes/api/v2/fleet-agents.$fleetAgentId.delete.ts"),
    route("fleet-agents/:fleetAgentId/message", "routes/api/v2/fleet-agents.$fleetAgentId.message.ts"),
    route("fleet-agents/:fleetAgentId/message-stream", "routes/api/v2/fleet-agents.$fleetAgentId.message-stream.ts"),
    route("fleet-agents/:fleetAgentId/group", "routes/api/v2/fleet-agents.$fleetAgentId.group.ts"),
    route("fleet-agents/:fleetAgentId/connect", "routes/api/v2/fleet-agents.$fleetAgentId.connect.ts"),
    // Always-on `render` MCP for fleet agents (PDF/screenshots via the on-demand Gotenberg box)
    route("fleet-render/:fleetAgentId/mcp", "routes/api/v2/fleet-render.$fleetAgentId.mcp.ts"),
    // Admin MCP for fleet agents — gestiona números/identidad/capacidades; inyectado SOLO en turnos admin
    route("fleet-admin/:fleetAgentId/mcp", "routes/api/v2/fleet-admin.$fleetAgentId.mcp.ts"),
    // WABA channel — Formmy forwards inbound here; partner writes per-number config
    route("fleet-agents/:fleetAgentId/waba/message", "routes/api/v2/fleet-agents.$fleetAgentId.waba.message.ts"),
    route("fleet-agents/:fleetAgentId/waba/trigger-reply", "routes/api/v2/fleet-agents.$fleetAgentId.waba.trigger-reply.ts"),
    route("fleet-agents/:fleetAgentId/waba/config", "routes/api/v2/fleet-agents.$fleetAgentId.waba.config.ts"),
    // Inbox WABA — conversaciones de un número (dashboard, on-demand)
    route("fleet-agents/:fleetAgentId/waba-inbox", "routes/api/v2/fleet-agents.$fleetAgentId.waba-inbox.ts"),
    // WABA connect (EasyBits as Formmy partner) — Embedded Signup popup + callback
    route("fleet-agents/:fleetAgentId/waba/connect/start", "routes/api/v2/fleet-agents.$fleetAgentId.waba.connect-start.ts"),
    route("fleet-agents/:fleetAgentId/waba/connect", "routes/api/v2/fleet-agents.$fleetAgentId.waba.connect.ts"),
    // WhatsApp Business Cloud API (Meta) — webhook de verificación + eventos
    route("whatsapp/webhook", "routes/api/v2/whatsapp-webhook.ts"),
    route("agents/:id/skills", "routes/api/v2/agent-skills.ts"),
    route("agents/:id/skills/import", "routes/api/v2/agent-skills-import.ts"),
    route("agents/:id/mcps", "routes/api/v2/agent-mcps.ts"),
    route("agents/:id/admin", "routes/api/v2/agent-admin.ts"),
    route("sandbox/:id/admin", "routes/api/v2/sandbox-admin.ts"),
    // Raw sandboxes (microVMs) — backs @easybits.cloud/sdk eb.sandboxes.*
    route("sandboxes", "routes/api/v2/sandboxes-collection.ts"),
    route("sandboxes/:id", "routes/api/v2/sandbox.ts"),
    route("sandboxes/:id/bg", "routes/api/v2/sandbox-bg.ts"),
    route("sandboxes/:id/bg/:execId", "routes/api/v2/sandbox-bg-detail.ts"),
    route("sandboxes/:id/files/:op", "routes/api/v2/sandbox-files.ts"),
    route("sandboxes/:id/:action", "routes/api/v2/sandbox-action.ts"),
    // Snapshots catalog (copy-on-write clone sources) — backs eb.sandboxes.snapshots.*
    route("snapshots", "routes/api/v2/snapshots-collection.ts"),
    route("snapshots/:id", "routes/api/v2/snapshot-item.ts"),
    // Always-on hosting (máquinas permanentes) — backs eb.machines.*
    route("machines/tiers", "routes/api/v2/machines-tiers.ts"),
    route("machines", "routes/api/v2/machines-collection.ts"),
    route("machines/:id", "routes/api/v2/machine.ts"),
    // eb.compute — gateway OpenAI-compatible (LLM managed dentro de sandboxes)
    route("compute/v1/chat/completions", "routes/api/v2/compute-chat.ts"),
    // eb.llm — proxy OpenAI→DeepSeek + balance + recargas
    route("llm/v1/chat/completions", "routes/api/v2/llm-proxy.ts"),
    route("llm/balance", "routes/api/v2/llm-balance.ts"),
    route("llm/recharge", "routes/api/v2/llm-recharge.ts"),
    route("public-stats", "routes/api/v2/public-stats.ts"),
    route("templates", "routes/api/v2/templates.ts"),
    route("files", "routes/api/v2/files.ts"),
    route("files/search", "routes/api/v2/file-search.ts"),
    route("files/bulk-delete", "routes/api/v2/files-bulk-delete.ts"),
    route("files/bulk-upload", "routes/api/v2/files-bulk-upload.ts"),
    route("files/:fileId", "routes/api/v2/file.ts"),
    route("files/:fileId/permissions", "routes/api/v2/file-permissions.ts"),
    route("files/:fileId/duplicate", "routes/api/v2/file-duplicate.ts"),
    route("files/:fileId/share", "routes/api/v2/fileShare.ts"),
    route("files/:fileId/restore", "routes/api/v2/file-restore.ts"),
    route("files/:fileId/transform", "routes/api/v2/file-transform.ts"),
    route("files/:fileId/optimize", "routes/api/v2/file-optimize.ts"),
    route("files/:fileId/share-token", "routes/api/v2/file-share-token.ts"),
    route("share-tokens", "routes/api/v2/share-tokens.ts"),
    route("providers", "routes/api/v2/providers.ts"),
    route("websites", "routes/api/v2/websites-collection.ts"),
    route("websites/:websiteId", "routes/api/v2/websites.ts"),
    route("websites/:websiteId/files", "routes/api/v2/website-files.ts"),
    route("workspaces", "routes/api/v2/workspaces-collection.ts"),
    route("workspaces/:workspaceId", "routes/api/v2/workspace.ts"),
    route("workspaces/:workspaceId/usage", "routes/api/v2/workspace-usage.ts"),
    route("workspaces/:workspaceId/keys", "routes/api/v2/workspace-keys.ts"),
    route("keys", "routes/api/v2/keys.ts"),
    route("keys/:keyId", "routes/api/v2/key.ts"),
    route("me", "routes/api/v2/me.ts"),
    route("presentations", "routes/api/v2/presentations.ts"),
    route("presentations/:id", "routes/api/v2/presentation.ts"),
    route("presentations/:id/deploy", "routes/api/v2/presentation-deploy.ts"),
    route("presentations/:id/generate", "routes/api/v2/presentation-generate.ts"),
    route("presentations/:id/outline", "routes/api/v2/presentation-outline.ts"),
    route("presentations/:id/variant", "routes/api/v2/presentation-variant.ts"),
    route("presentations/:id/add-slide", "routes/api/v2/presentation-add-slide.ts"),
    route("landing-generate", "routes/api/v2/landing-generate.ts"),
    route("landing-refine-section", "routes/api/v2/landing-refine-section.ts"),
    route("landing2-generate", "routes/api/v2/landing2-generate.ts"),
    route("landing2-refine-block", "routes/api/v2/landing2-refine-block.ts"),
    route("landing3-generate", "routes/api/v2/landing3-generate.ts"),
    route("landing3-refine", "routes/api/v2/landing3-refine.ts"),
    route("document-directions", "routes/api/v2/document-directions.ts"),
    route("document-generate", "routes/api/v2/document-generate.ts"),
    route("document-refine", "routes/api/v2/document-refine.ts"),
    route("document-enhance", "routes/api/v2/document-enhance.ts"),
    route("documents", "routes/api/v2/documents.ts"),
    route("documents/:id", "routes/api/v2/document.ts"),
    route("documents/:id/deploy", "routes/api/v2/document-deploy.ts"),
    route("documents/:id/pdf", "routes/api/v2/document-pdf.ts"),
    route("documents/:id/images", "routes/api/v2/document-images.ts"),
    route("documents/:id/thumbnail", "routes/api/v2/document-thumbnail.ts"),
    route("presentations/:id/pdf", "routes/api/v2/presentation-pdf.ts"),
    route("documents/:id/unpublish", "routes/api/v2/document-unpublish.ts"),
    route("documents/:id/clone", "routes/api/v2/document-clone.ts"),
    route("document-from-cfdi", "routes/api/v2/document-from-cfdi.ts"),
    route("public/cfdi-preview", "routes/api/v2/public-cfdi-preview.ts"),
    route("documents/:id/pages", "routes/api/v2/document-pages.ts"),
    route("documents/:id/pages/reorder", "routes/api/v2/document-pages-reorder.ts"),
    route("documents/:id/pages/:pageId", "routes/api/v2/document-page.ts"),
    route("documents/:id/pages/:pageId/element", "routes/api/v2/document-page-element.ts"),
    route("documents/:id/slots", "routes/api/v2/document-slots.ts"),
    route("documents/:id/fill", "routes/api/v2/document-fill.ts"),
    route("document-watch", "routes/api/v2/document-watch.ts"),
    route("book-generate", "routes/api/v2/book-generate.ts"),
    route("video-generate", "routes/api/v2/video-generate.ts"),
    route("videos", "routes/api/v2/videos.ts"),
    route("videos/:id", "routes/api/v2/video.ts"),
    route("characters", "routes/api/v2/characters.ts"),
    route("characters/:id", "routes/api/v2/character.ts"),
    route("webhooks", "routes/api/v2/webhooks.ts"),
    route("webhooks/:webhookId", "routes/api/v2/webhook.ts"),
    route("notifications", "routes/api/v2/notifications.ts"),
    route("databases", "routes/api/v2/databases.ts"),
    route("databases/:dbId", "routes/api/v2/database.ts"),
    route("databases/:dbId/query", "routes/api/v2/database-query.ts"),
    route("usage", "routes/api/v2/usage.ts"),
    route("svc-usage", "routes/api/v2/svc-usage.ts"),
    route("svc-instances", "routes/api/v2/svc-instances.ts"),
    route("generation-packs", "routes/api/v2/generation-packs.ts"),
    route("sandbox-reservations", "routes/api/v2/sandbox-reservations.ts"),
    route("docs", "routes/api/v2/docs.ts"),
    route("domains", "routes/api/v2/domains.ts"),
    route("domains/:domainId/verify", "routes/api/v2/domain-verify.ts"),
    route("themes", "routes/api/v2/themes.ts"),
    route("brand-kits", "routes/api/v2/brand-kits.ts"),
    route("brand-kits/:id", "routes/api/v2/brand-kit.ts"),
    route("forms/:formId/submit", "routes/api/v2/forms.$formId.submit.ts"),
    route("forms/:formId/enrich", "routes/api/v2/forms.$formId.enrich.ts"),
    route("quiz-checkout", "routes/api/v2/quiz-checkout.tsx"),
    route("quiz-cotizacion-pdf", "routes/api/v2/quiz-cotizacion-pdf.tsx"),
    route("quiz-lead-submit", "routes/api/v2/quiz-lead-submit.tsx"),
  ]),
  // v1
  ...prefix("api/v1", [
    // Telemetry
    route("telemetry", "routes/api/v1/telemetry/telemetry.tsx"),
    // AI & LLMs
    ...prefix("llms", [route("devstral", "routes/api/llms/devstral.ts")]), // LLMs communication Jun25
    route(":fileId/main.m3u8", "routes/api/v1/mainm3u8.tsx"), // experiment
    // route("tokens", "routes/api/v1/tokens.tsx"),
    route("tokens/:token?", "routes/api/v1/tokens.tsx"),
    route("conversion_webhook", "routes/api/v1/conversion_webhook.tsx"),
    route("user", "routes/api/v1/user.tsx"),
    route("assets", "routes/api/v1/assets.tsx"),
    route("clients", "routes/api/v1/clients.tsx"),
    route("files", "routes/api/v1/files.tsx"),
    route("utils", "routes/api/v1/utils.tsx"),
    route("downloads", "routes/api/v1/downloads.tsx"),
    route("uploads", "routes/api/v1/direct-upload-edit.ts"),
    route("reviews", "routes/api/v1/reviews.tsx"),
    route("store-config", "routes/api/v1/store-config.tsx"),
    ...prefix("ai", [
      route("sugestions", "routes/api/v1/ai/sugestions.tsx"),
      route("chat", "routes/api/v1/ai/chat.tsx"),
    ]),
    ...prefix("stripe", [
      route("account", "routes/api/v1/stripe/account.tsx"),
      route("account_session", "routes/api/v1/stripe/account_session.tsx"),
      route("plans", "routes/api/v1/stripe/plans.tsx"),
      route("webhook", "routes/api/v1/stripe/webhook.tsx"),
      route("webhook/merchant", "routes/api/v1/stripe/webhook/merchant.tsx"),
      route("checkout", "routes/api/v1/stripe/checkout.tsx"),
      route("success", "routes/api/v1/stripe/success.tsx"),
    ]),
  ]),

  // Static site proxy
  route("s/:slug/*", "routes/s.$slug.$.tsx"),

  // Magic share link entry point — validates JWT, sets share cookie, redirects to editor
  route("share/:token", "routes/share.$token.tsx"),
  // Lightweight share editor for documents (edit permission only — view/download still go to PDF)
  route("share/document/:token", "routes/share.document.$token.tsx"),
  // Persistence endpoint for share-edit sessions
  route("api/v2/share/documents/:token/section", "routes/api/v2/share.documents.$token.section.ts"),

  // OAuth 2.1 (MCP connector flow for Claude.ai / Cowork)
  route("/.well-known/oauth-protected-resource", "routes/api/wellknown/oauth-protected-resource.ts"),
  route("/.well-known/oauth-authorization-server", "routes/api/wellknown/oauth-authorization-server.ts"),
  route("/oauth/register", "routes/api/oauth/register.ts"),
  route("/oauth/authorize", "routes/api/oauth/authorize.ts"),
  route("/oauth/token", "routes/api/oauth/token.ts"),

  route("/.well-known/*", "components/common/NoContent.tsx"),
  route("experiment", "components/experimental/multiple_livekit_test.tsx"),
  route("webinar", "routes/webinar/webinar.tsx"),

  // Plugin APIs
  route("/kit/*", "routes/api/v1/kit/kit_endpoint.tsx"),
  // aws SES SNS enpoint (suscription)
  route("/sns", "routes/api/v1/sns.tsx"),
] satisfies RouteConfig;
