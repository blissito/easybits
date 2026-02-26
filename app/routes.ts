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
  route("/developers", "routes/developers.tsx"),
  route("/docs", "routes/docs.tsx"),
  route("/status", "routes/status.tsx"),
  route("/blog", "routes/blog.tsx"),
  route("/blog/:slug", "routes/blog.$slug.tsx"),
  route("/sitemap.xml", "routes/sitemap.xml.tsx"),
  route("/robots.txt", "routes/robots.txt.tsx"),
  route("/terminos-y-condiciones", "routes/terminos.tsx"),
  route("/aviso-de-privacidad", "routes/aviso.tsx"),
  // public video link @todo revisit private only? tokens?
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed share
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
  // AI Chat
  route("/ai-chat", "routes/ai-chat.tsx"),

  // user dash
  ...prefix("dash", [
    route("compras/:assetId", "routes/purchase_detail.tsx"),
    route("compras/:assetSlug/review", "routes/assets/ReviewAsset.tsx"),
    layout("components/DashLayout/DashLayout.tsx", [
      index("routes/start.tsx"),
      route("estadisticas", "routes/stats.tsx"),
      ...prefix("assets", [
        index("routes/assets/assets.tsx"),
        route(":assetId/edit", "routes/assets/EditAsset.tsx"),
      ]),
      route("tienda", "routes/store.tsx"),

      route("ventas", "routes/sales.tsx"),
      route("clientes", "routes/clients.tsx"),

      route("compras", "routes/purchases.tsx"),
      route("archivos", "routes/files.tsx"),
      route("perfil", "routes/profile/profile.tsx"),
      // Developer dashboard
      layout("routes/dash/developer/developer.tsx", [
        ...prefix("developer", [
          index("routes/dash/developer/keys.tsx"),
          route("files", "routes/dash/developer/files.tsx"),
          route("providers", "routes/dash/developer/providers.tsx"),
          route("setup", "routes/dash/developer/setup.tsx"),
          route("websites", "routes/dash/developer/websites.tsx"),
        ]),
      ]),
      // Admin dashboard
      layout("routes/dash/admin/admin.tsx", [
        ...prefix("admin", [
          index("routes/dash/admin/users.tsx"),
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
  // Health
  route("api/health", "routes/api/health.ts"),
  // v2
  ...prefix("api/v2", [
    route("files", "routes/api/v2/files.ts"),
    route("files/search", "routes/api/v2/file-search.ts"),
    route("files/:fileId", "routes/api/v2/file.ts"),
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
    route("keys", "routes/api/v2/keys.ts"),
    route("keys/:keyId", "routes/api/v2/key.ts"),
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

  route("/.well-known/*", "components/common/NoContent.tsx"),
  route("experiment", "components/experimental/multiple_livekit_test.tsx"),
  route("webinar", "routes/webinar/webinar.tsx"),

  // Plugin APIs
  route("/kit/*", "routes/api/v1/kit/kit_endpoint.tsx"),
  // aws SES SNS enpoint (suscription)
  route("/sns", "routes/api/v1/sns.tsx"),
] satisfies RouteConfig;
