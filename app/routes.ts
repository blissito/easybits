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
      route("start", "routes/start.tsx"),
      route("stats", "routes/stats.tsx"),
      route("assets", "routes/assets.tsx"),
      route("store", "routes/store.tsx"),
      route("sales", "routes/sales.tsx"),
      route("clients", "routes/clients.tsx"),
      route("purchases", "routes/purchases.tsx"),
    ]),
  ]),
  ...prefix("api/v1", [
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
    route("uploads/:storageKey/delete", "routes/api/v1/delete.ts"),
  ]),
] satisfies RouteConfig;
