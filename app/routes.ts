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
    route(":assetSlug/review", "routes/assets/ReviewAsset.tsx"),
  ]),
  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login/:success?", "routes/login.tsx"),
  route("/logout", "routes/logout.tsx"),
  route("/preview", "routes/preview.tsx"),
  route("/onboarding", "routes/onboarding/onboarding.tsx"),
  route("/planes", "routes/planes.tsx"),
  route("/funcionalidades", "routes/funcionalidades.tsx"),
  route("/blog", "routes/blog.tsx"),
  route("/terminos-y-condiciones", "routes/terminos.tsx"),
  route("/aviso-de-privacidad", "routes/aviso.tsx"),
  route("/blogPost", "routes/blogPost.tsx"),
  // public video link @todo revisit private only? tokens?
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed share
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
  // user dash
  ...prefix("dash", [
    layout("components/DashLayout/DashLayout.tsx", [
      index("routes/start.tsx"),
      route("estadisticas", "routes/stats.tsx"),
      ...prefix("assets", [
        index("routes/assets/assets.tsx"),
        route(":assetId/edit", "routes/assets/EditAsset.tsx"),
      ]),
      route("tienda", "routes/store.tsx"),

      ...prefix("ventas", [index("routes/sales.tsx")]),
      route("clientes", "routes/clients.tsx"),
      route("compras/:assetId", "routes/purchase_detail.tsx"),
      route("compras", "routes/purchases.tsx"),
      route("archivos", "routes/files.tsx"),
      route("perfil", "routes/profile/profile.tsx"),
      route("websites", "routes/dash/websites.tsx"),
    ]),
  ]),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // v1
  ...prefix("api/v1", [
    route(":fileId/main.m3u8", "routes/api/v1/mainm3u8.tsx"), // experiment
    // route("tokens", "routes/api/v1/tokens.tsx"),
    route("tokens/:token?", "routes/api/v1/tokens.tsx"),
    route("conversion_webhook", "routes/api/v1/conversion_webhook.tsx"),
    route("user", "routes/api/v1/user.tsx"),
    route("assets", "routes/api/v1/assets.tsx"),
    route("reviews", "routes/api/v1/reviews.tsx"),
    route("clients", "routes/api/v1/clients.tsx"),
    route("files", "routes/api/v1/files.tsx"),
    route("utils", "routes/api/v1/utils.tsx"),
    route("downloads", "routes/api/v1/downloads.tsx"),
    route("uploads", "routes/api/v1/direct-upload-edit.ts"),
    ...prefix("stripe", [
      route("account", "routes/api/v1/stripe/account.tsx"),
      route("account_session", "routes/api/v1/stripe/account_session.tsx"),
      route("plans", "routes/api/v1/stripe/plans.tsx"),
      route("webhook", "routes/api/v1/stripe/webhook.tsx"),
      route("checkout", "routes/api/v1/stripe/checkout.tsx"),
      route("success", "routes/api/v1/stripe/success.tsx"),
    ]),
  ]),
  route("experiment", "components/experimental/multiple_livekit_test.tsx"),
  route("webinar", "routes/webinar/webinar.tsx"),
  route("waitlist", "routes/waitlist.tsx"),
  route("blissmo", "routes/blissmo.tsx"),
  // Plugin APIs
  route("/kit/*", "routes/api/v1/kit/kit_endpoint.tsx"),
  // aws SES SNS enpoint (suscription)
  route("/sns", "routes/api/v1/sns.tsx"),
] satisfies RouteConfig;
