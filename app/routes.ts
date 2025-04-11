import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  // public assetLanding
  route("p/:assetSlug", "routes/assets/PublicCustomLanding.tsx"),
  // public info
  index("routes/home/home.tsx"),
  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login", "routes/login.tsx"),
  route("/preview", "routes/preview.tsx"),
  route("/planes", "routes/planes.tsx"),
  route("/funcionalidades", "routes/funcionalidades.tsx"),
  route("/blog", "routes/blog.tsx"),
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

      ...prefix("ventas", [
        index("routes/sales.tsx"),
        route("stripe", "routes/stripe.tsx"),
      ]),
      route("clientes", "routes/clients.tsx"),
      route("compras", "routes/purchases.tsx"),
      route("archivos", "routes/files.tsx"),
      route("perfil", "routes/profile/profile.tsx"),
    ]),
  ]),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // v1
  ...prefix("api/v1", [
    route(":fileId/main.m3u8", "routes/api/v1/mainm3u8.tsx"), // experiment
    route("tokens", "routes/api/v1/tokens.tsx"),
    route("conversion_webhook", "routes/api/v1/conversion_webhook.tsx"),
    route("user", "routes/api/v1/user.tsx"),
    route("assets", "routes/api/v1/assets.tsx"),
    route("files", "routes/api/v1/files.tsx"),
    route("utils", "routes/api/v1/utils.tsx"),
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
    ...prefix("stripe", [
      route("account", "routes/api/v1/stripe/account.tsx"),
      route("account_session", "routes/api/v1/stripe/account_session.tsx"),
      route("plans", "routes/api/v1/stripe/plans.tsx"),
    ]),
  ]),
  route("experiment", "components/experimental/multiple_livekit_test.tsx"),
  route("webinar", "routes/webinar/webinar.tsx"),
  route("waitlist", "routes/waitlist.tsx"),
  // Plugin APIs
  route("/kit/*", "routes/api/v1/kit/kit_endpoint.tsx"),
] satisfies RouteConfig;
