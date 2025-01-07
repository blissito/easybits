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
] satisfies RouteConfig;
