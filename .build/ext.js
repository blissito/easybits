"use strict";
var __StripeExtExports = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/@stripe/ui-extension-sdk/version.js
  var require_version = __commonJS({
    "node_modules/@stripe/ui-extension-sdk/version.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.SDK_VERSION = void 0;
      exports.SDK_VERSION = "8.10.0";
    }
  });

  // .build/manifest.js
  var manifest_exports = {};
  __export(manifest_exports, {
    BUILD_TIME: () => BUILD_TIME,
    default: () => manifest_default
  });
  __reExport(manifest_exports, __toESM(require_version(), 1));
  var BUILD_TIME = "2025-06-06 12:54:13.186295 -0600 CST m=+4.340789793";
  var manifest_default = {
    "id": "com.example.easybits",
    "version": "0.0.1",
    "name": "EasyBits",
    "icon": "",
    "permissions": [
      {
        "permission": "customer_read",
        "purpose": "Receive access to the customer\u2019s phone number?? and email??"
      },
      {
        "permission": "connected_account_read",
        "purpose": "to work with account id"
      }
    ],
    "connect_permissions": null,
    "allowed_redirect_uris": [
      "https://www.easybits.cloud/login/success"
    ],
    "stripe_api_access_type": "oauth",
    "distribution_type": "public"
  };
  return __toCommonJS(manifest_exports);
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbm9kZV9tb2R1bGVzL0BzdHJpcGUvc3JjL3ZlcnNpb24udHMiLCAibWFuaWZlc3QuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbbnVsbCwgIlxuXG5cbmV4cG9ydCAqIGZyb20gJ0BzdHJpcGUvdWktZXh0ZW5zaW9uLXNkay92ZXJzaW9uJztcbmV4cG9ydCBjb25zdCBCVUlMRF9USU1FID0gJzIwMjUtMDYtMDYgMTI6NTQ6MTMuMTg2Mjk1IC0wNjAwIENTVCBtPSs0LjM0MDc4OTc5Myc7XG5cblxuZXhwb3J0IGRlZmF1bHQge1xuICBcImlkXCI6IFwiY29tLmV4YW1wbGUuZWFzeWJpdHNcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMC4wLjFcIixcbiAgXCJuYW1lXCI6IFwiRWFzeUJpdHNcIixcbiAgXCJpY29uXCI6IFwiXCIsXG4gIFwicGVybWlzc2lvbnNcIjogW1xuICAgIHtcbiAgICAgIFwicGVybWlzc2lvblwiOiBcImN1c3RvbWVyX3JlYWRcIixcbiAgICAgIFwicHVycG9zZVwiOiBcIlJlY2VpdmUgYWNjZXNzIHRvIHRoZSBjdXN0b21lclx1MjAxOXMgcGhvbmUgbnVtYmVyPz8gYW5kIGVtYWlsPz9cIlxuICAgIH0sXG4gICAge1xuICAgICAgXCJwZXJtaXNzaW9uXCI6IFwiY29ubmVjdGVkX2FjY291bnRfcmVhZFwiLFxuICAgICAgXCJwdXJwb3NlXCI6IFwidG8gd29yayB3aXRoIGFjY291bnQgaWRcIlxuICAgIH1cbiAgXSxcbiAgXCJjb25uZWN0X3Blcm1pc3Npb25zXCI6IG51bGwsXG4gIFwiYWxsb3dlZF9yZWRpcmVjdF91cmlzXCI6IFtcbiAgICBcImh0dHBzOi8vd3d3LmVhc3liaXRzLmNsb3VkL2xvZ2luL3N1Y2Nlc3NcIlxuICBdLFxuICBcInN0cmlwZV9hcGlfYWNjZXNzX3R5cGVcIjogXCJvYXV0aFwiLFxuICBcImRpc3RyaWJ1dGlvbl90eXBlXCI6IFwicHVibGljXCJcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBYSxjQUFBLGNBQWM7Ozs7O0FDQTNCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFHQSwrQkFBYztBQUNQLE1BQU0sYUFBYTtBQUcxQixNQUFPLG1CQUFRO0FBQUEsSUFDYixNQUFNO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYjtBQUFBLFFBQ0UsY0FBYztBQUFBLFFBQ2QsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxjQUFjO0FBQUEsUUFDZCxXQUFXO0FBQUEsTUFDYjtBQUFBLElBQ0Y7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLElBQ3ZCLHlCQUF5QjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRjtBQUFBLElBQ0EsMEJBQTBCO0FBQUEsSUFDMUIscUJBQXFCO0FBQUEsRUFDdkI7IiwKICAibmFtZXMiOiBbXQp9Cg==
