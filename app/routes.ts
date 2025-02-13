import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  // public info
  index("routes/home/home.tsx"),
  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login", "routes/login.tsx"),
  route("/planes", "routes/planes.tsx"),
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
      route("assets", "routes/assets/assets.tsx"),
      route("tienda", "routes/store.tsx"),
      route("ventas", "routes/sales.tsx"),
      route("clientes", "routes/clients.tsx"),
      route("compras", "routes/purchases.tsx"),
      route("archivos", "routes/files.tsx"),
    ]),
  ]),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // v1
  ...prefix("api/v1", [
    route("tokens", "routes/api/v1/tokens.tsx"),
    route("conversion_webhook", "routes/api/v1/conversion_webhook.tsx"),
    route("user", "routes/api/v1/user.tsx"),
    route("assets", "routes/api/v1/assets.tsx"),
    route("files", "routes/api/v1/files.tsx"),
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
  ]),
] satisfies RouteConfig;
