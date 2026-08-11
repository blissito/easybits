import { describe, it, expect } from "vitest";
import { buildPublishScript, runspecSchema, SECRETS_FILE } from "~/.server/core/releaseOperations";

// These assertions exist because both rules look like needless verbosity and
// have a tempting one-line "simplification" that silently breaks uploads:
//   - `tar | base64` through exec stdout truncates (backupOperations.ts:11-13)
//   - `tar | curl -T -` sends chunked with no Content-Length; a presigned PUT
//     to S3/Tigris rejects that.
// A broken release only reveals itself the day someone has to rebuild a box.
describe("release publish transport", () => {
  const spec = runspecSchema.parse({ appDir: "/app", buildCommand: "npm run build" });
  const script = buildPublishScript({
    spec,
    tarball: "/tmp/rel_x.tar.gz",
    urlFile: "/tmp/.eb-rel_x.url",
  });

  it("never pipes the tarball through base64", () => {
    expect(script).not.toMatch(/base64/);
  });

  it("uploads from a FILE, never from a pipe", () => {
    expect(script).toContain("curl -fsS -X PUT -T '/tmp/rel_x.tar.gz'");
    expect(script).not.toMatch(/\|\s*curl/);
    expect(script).not.toMatch(/-T\s+-/);
  });

  it("keeps the signed URL off the command line", () => {
    // Read back from a file at run time — exec output and journald must never
    // capture a write capability on our bucket.
    expect(script).toContain(`"$(cat '/tmp/.eb-rel_x.url')"`);
    expect(script).not.toMatch(/X-Amz-Signature/);
  });

  it("checks the size limit before uploading, and cleans up either way", () => {
    const lines = script.split("\n");
    const sizeGate = lines.findIndex((l) => l.includes("TOOBIG"));
    const upload = lines.findIndex((l) => l.startsWith("curl"));
    expect(sizeGate).toBeGreaterThanOrEqual(0);
    expect(sizeGate).toBeLessThan(upload);
    expect(script).toContain("rm -f '/tmp/rel_x.tar.gz' '/tmp/.eb-rel_x.url'");
  });

  it("quotes the app dir so a path with spaces can't split the command", () => {
    const odd = buildPublishScript({
      spec: runspecSchema.parse({ appDir: "/srv/my app" }),
      tarball: "/tmp/a.tgz",
      urlFile: "/tmp/a.url",
    });
    expect(odd).toContain("cd '/srv/my app'");
  });

  it("excludes node_modules and .git by default", () => {
    expect(script).toContain("--exclude='node_modules'");
    expect(script).toContain("--exclude='.git'");
  });
});

describe("runspec validation", () => {
  it("rejects secrets in env — it is stored in the DB and baked into every tarball", () => {
    expect(() =>
      runspecSchema.parse({ appDir: "/app", env: { STRIPE_SECRET: "sk_live_x" } })
    ).toThrow();
    expect(() => runspecSchema.parse({ appDir: "/app", env: { NODE_ENV: "production" } })).not.toThrow();
  });

  it("requires an absolute appDir", () => {
    expect(() => runspecSchema.parse({ appDir: "app" })).toThrow();
  });
});

// Deploys de subminuto: un release "prebuilt" DEBE llevar el build y las deps.
// Excluirlos es justo lo que obliga a un npm ci + bundler dentro de la caja, que
// es de donde salen los deploys de varios minutos. Fly es rápido por lo mismo:
// la imagen llega construida.
describe("prebuilt releases — el artefacto lleva el build hecho", () => {
  const spec = runspecSchema.parse({ appDir: "/app", prebuilt: true });
  const script = buildPublishScript({ spec, tarball: "/tmp/r.tgz", urlFile: "/tmp/r.url" });

  it("NO excluye node_modules ni dist cuando es prebuilt", () => {
    expect(script).not.toContain("--exclude='node_modules'");
    expect(script).not.toContain("--exclude='dist'");
    expect(script).not.toContain("--exclude='build'");
  });

  it("sigue excluyendo lo que nunca sirve en producción", () => {
    expect(script).toContain("--exclude='.git'");
    expect(script).toContain("--exclude='.cache'");
  });

  it("respeta los excludes explícitos del usuario aunque sea prebuilt", () => {
    const s = buildPublishScript({
      spec: runspecSchema.parse({ appDir: "/app", prebuilt: true, excludes: ["secretos"] }),
      tarball: "/tmp/r.tgz",
      urlFile: "/tmp/r.url",
    });
    expect(s).toContain("--exclude='secretos'");
  });

  it("sin prebuilt, sigue excluyendo el build (el default)", () => {
    const s = buildPublishScript({
      spec: runspecSchema.parse({ appDir: "/app" }),
      tarball: "/tmp/r.tgz",
      urlFile: "/tmp/r.url",
    });
    expect(s).toContain("--exclude='node_modules'");
    expect(s).toContain("--exclude='dist'");
  });
});

// Los secretos de la app viven en el vault del dueño y sólo se materializan
// DENTRO de la máquina, en un archivo que el build y el arranque cargan. Si ese
// archivo se colara en el tarball, cada release publicado llevaría dentro la
// contraseña de la base de datos del cliente — y los releases se guardan en
// object storage y se restauran en cajas nuevas.
describe("secretos de la app", () => {
  it("el archivo de secretos nunca entra en el tarball", () => {
    const spec = runspecSchema.parse({
      appDir: "/app",
      buildCommand: "npm run build",
      secretNames: ["DATABASE_URL", "JWT_SECRET"],
    });
    const script = buildPublishScript({
      spec,
      tarball: "/tmp/rel_x.tar.gz",
      urlFile: "/tmp/.eb-rel_x.url",
    });
    expect(script).toContain(`--exclude='${SECRETS_FILE}'`);
  });

  it("tampoco en un release prebuilt, que conserva casi todos los excludes", () => {
    const spec = runspecSchema.parse({
      appDir: "/app",
      prebuilt: true,
      secretNames: ["DATABASE_URL"],
    });
    const script = buildPublishScript({
      spec,
      tarball: "/tmp/rel_y.tar.gz",
      urlFile: "/tmp/.eb-rel_y.url",
    });
    expect(script).toContain(`--exclude='${SECRETS_FILE}'`);
  });

  it("el runspec guarda nombres, nunca valores", () => {
    // Un nombre en minúsculas o con forma rara suele ser un valor pegado por
    // error en el campo equivocado.
    expect(() =>
      runspecSchema.parse({ appDir: "/app", secretNames: ["mongodb://user:pass@host"] })
    ).toThrow();
    expect(() =>
      runspecSchema.parse({ appDir: "/app", secretNames: ["DATABASE_URL"] })
    ).not.toThrow();
  });

  it("sigue rechazando un secreto metido en runspec.env", () => {
    expect(() =>
      runspecSchema.parse({ appDir: "/app", env: { JWT_SECRET: "algo" } })
    ).toThrow();
  });
});
