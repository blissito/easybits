import { describe, it, expect } from "vitest";
import { buildPublishScript, runspecSchema } from "~/.server/core/releaseOperations";

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
