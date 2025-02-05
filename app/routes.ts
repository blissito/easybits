import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home/home.tsx"),
  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login", "routes/login.tsx"),
  // public link @todo revisit private only? tokens?
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // groups
  ...prefix("dash", [
    layout("components/ProfileLayout/ProfileLayout.tsx", [
      index("routes/start.tsx"),
      route("estadisticas", "routes/stats.tsx"),
      route("assets", "routes/assets/assets.tsx"),
      route("tienda", "routes/store.tsx"),
      route("ventas", "routes/sales.tsx"),
      route("clientes", "routes/clients.tsx"),
      route("compras", "routes/purchases.tsx"),
    ]),
  ]),
  ...prefix("api/v1", [
    route("assets", "routes/api/v1/assets.tsx"),

    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
  ]),
] satisfies RouteConfig;
