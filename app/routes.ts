import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/dominio-personalizado", "routes/domains.tsx"),
  //
  route("/login", "routes/login.tsx"),
  ...prefix("api/v1", [
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
    route("uploads/:storageKey/delete", "routes/api/v1/delete.ts"),
  ]),
  // multipar upload
  route("api/upload", "routes/api/v1/upload.ts"),
  // public link @todo revisit
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
] satisfies RouteConfig;
