import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/login", "routes/login.tsx"),
  route("/auth", "routes/auth.tsx"),
  ...prefix("api/v1", [
    route("uploads", "routes/api/v1/direct-uploads.ts"),
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
    route("uploads/:storageKey/delete", "routes/api/v1/delete.ts"),
  ]),
  // experiment multipar
  route("api/upload", "routes/api/v1/upload.ts"),
  // public link @todo revisit
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
] satisfies RouteConfig;
