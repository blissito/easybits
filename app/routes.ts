import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/login", "routes/login.tsx"),
  ...prefix("api/v1", [
    route("uploads", "routes/api/v1/direct-uploads.ts"),
    route("uploads/:storageKey", "routes/api/v1/direct-upload-edit.ts"),
  ]),
  // public link @todo revisit
  route("/videos/:storageKey", "routes/videos/public.tsx"),
  // embed
  route("/embed/video/:storageKey", "routes/videos/video.tsx"),
] satisfies RouteConfig;
