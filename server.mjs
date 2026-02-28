import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import sourceMapSupport from "source-map-support";
import getPort from "get-port";

process.env.NODE_ENV = process.env.NODE_ENV ?? "production";

sourceMapSupport.install({
  retrieveSourceMap(source) {
    if (source.startsWith("file://")) {
      const filePath = url.fileURLToPath(source);
      const sourceMapPath = `${filePath}.map`;
      if (fs.existsSync(sourceMapPath)) {
        return { url: source, map: fs.readFileSync(sourceMapPath, "utf8") };
      }
    }
    return null;
  },
});

// Paths commonly probed by vulnerability scanners and bots.
// Requests matching these are rejected early with a 404 to avoid
// polluting logs with "No route matches URL" errors from React Router.
const BOT_PROBE_PATTERNS = [
  /^\/__debug/,
  /^\/__cve/,
  /^\/wp-/,
  /^\/wordpress/i,
  /^\/\.env/,
  /^\/\.git/,
  /^\/phpmyadmin/i,
  /^\/admin\/?$/,
  /^\/administrator/i,
  /^\/xmlrpc\.php/,
  /^\/wp-login/,
  /^\/wp-admin/,
  /^\/cgi-bin/,
  /^\/vendor/,
  /^\/telescope/,
  /^\/config\.(json|yml|yaml|php|bak)/,
  /^\/backup/i,
  /^\/debug/,
  /^\/console/,
  /^\/solr/,
  /^\/actuator/,
  /^\/_ignition/,
];

async function run() {
  const port =
    parseNumber(process.env.PORT) ?? (await getPort({ port: 3000 }));
  const buildPathArg = process.argv[2];
  if (!buildPathArg) {
    console.error(
      "\n  Usage: node server.mjs <server-build-path> - e.g. node server.mjs build/server/index.js"
    );
    process.exit(1);
  }

  const buildPath = path.resolve(buildPathArg);
  const build = await import(url.pathToFileURL(buildPath).href);

  const app = express();
  app.disable("x-powered-by");
  app.use(compression());

  // Static assets
  app.use(
    path.posix.join(build.publicPath, "assets"),
    express.static(path.join(build.assetsBuildDirectory, "assets"), {
      immutable: true,
      maxAge: "1y",
    })
  );
  app.use(build.publicPath, express.static(build.assetsBuildDirectory));
  app.use(express.static("public", { maxAge: "1h" }));

  // Logging
  app.use(morgan("tiny"));

  // Block bot/scanner probes before they hit React Router
  app.use((req, res, next) => {
    if (BOT_PROBE_PATTERNS.some((p) => p.test(req.path))) {
      res.status(404).end();
      return;
    }
    next();
  });

  // React Router handler
  app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

  const onListen = () => {
    const address =
      process.env.HOST ||
      Object.values(os.networkInterfaces())
        .flat()
        .find((ip) => String(ip?.family).includes("4") && !ip?.internal)
        ?.address;
    if (!address) {
      console.log(`[easybits] http://localhost:${port}`);
    } else {
      console.log(
        `[easybits] http://localhost:${port} (http://${address}:${port})`
      );
    }
  };

  const server = process.env.HOST
    ? app.listen(port, process.env.HOST, onListen)
    : app.listen(port, onListen);

  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.once(signal, () => server?.close(console.error));
  });
}

function parseNumber(raw) {
  if (raw === undefined) return undefined;
  const maybe = Number(raw);
  if (Number.isNaN(maybe)) return maybe;
  return maybe;
}

run();
