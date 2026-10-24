import { describe, expect, it } from "vitest";
import { releaseHandoff, waitForRelease } from "~/.server/core/browserHandoff";

describe("browserHandoff", () => {
  it("devolver el control despierta al agente que esperaba", async () => {
    const p = waitForRelease("s1", 5_000);
    setTimeout(() => releaseHandoff("s1"), 10);
    expect(await p).toBe(true);
  });
  it("sin respuesta, la espera termina por tiempo", async () => {
    expect(await waitForRelease("s2", 20)).toBe(false);
  });
  it("devolver otra sesión no despierta ésta", async () => {
    const p = waitForRelease("s3", 40);
    releaseHandoff("otra");
    expect(await p).toBe(false);
  });
});
