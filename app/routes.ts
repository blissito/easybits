import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/dominio-personalizado", "routes/domains.tsx"),
  route("/login", "routes/login.tsx"),
  // public link @todo revisit private only? tokens?
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // groups
  ...prefix("dash", [route("assets", "routes/assets.tsx")]),
  ...prefix("api/v1", [
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
    route("uploads/:storageKey/delete", "routes/api/v1/delete.ts"),
  ]),
] satisfies RouteConfig;
