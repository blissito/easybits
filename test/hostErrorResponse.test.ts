import { describe, it, expect } from "vitest";
import { hostErrorResponse, SandboxHostError, SandboxHostTimeoutError } from "~/.server/core/sandboxOperations";

// El host envuelve los errores del agente in-VM como 502 con el status real
// en el texto. Un archivo inexistente debe salir como 404, nunca como 500.
describe("hostErrorResponse", () => {
  it("desenvuelve el 404 del agente escondido en un 502 del host", async () => {
    const e = new SandboxHostError(
      "GET",
      "/v1/sandbox/x/files/read",
      502,
      '{"error":"agent /files/read → 404: {\\"error\\":\\"open /workspace/nope.txt: no such file or directory\\"}\\n"}\n',
    );
    const r = hostErrorResponse(e)!;
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "open /workspace/nope.txt: no such file or directory" });
  });
  // Antes estos tres salían como 500 "Unexpected Server Error" (medido 2026-09-25 tras un
  // snapshot: exec/suspend/destroy → 500 pelón). Ahora cada uno dice qué pasó.
  it("agente inalcanzable dentro de la caja → 409 SandboxUnreachable", async () => {
    const r = hostErrorResponse(
      new SandboxHostError(
        "POST",
        "/v1/sandbox/x/exec",
        502,
        '{"error":"Post \\"http://172.20.0.118:9909/exec\\": dial tcp 172.20.0.118:9909: connect: no route to host"}',
      ),
    )!;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "SandboxUnreachable" });
  });
  it("un 5xx interior o del host → 502 con el mensaje", async () => {
    const r = hostErrorResponse(new SandboxHostError("GET", "/x", 502, '{"error":"agent /exec → 500: boom"}'))!;
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: "SandboxHostError", status: 500, message: "boom" });
    const r2 = hostErrorResponse(new SandboxHostError("DELETE", "/v1/sandbox/x", 500, '{"error":"snapshot in progress"}'))!;
    expect(r2.status).toBe(502);
    expect((await r2.json()).message).toBe("snapshot in progress");
  });
  it("timeout contra el host → 504 SandboxHostTimeout", async () => {
    const r = hostErrorResponse(new SandboxHostTimeoutError("POST", "/v1/sandbox/x/snapshot", 120_000))!;
    expect(r.status).toBe(504);
    expect(await r.json()).toMatchObject({ error: "SandboxHostTimeout" });
  });
  it("un error que no es del host sigue siendo nuestro (null → 500)", () => {
    expect(hostErrorResponse(new Error("bug nuestro"))).toBeNull();
  });
  it("un 4xx directo del host pasa tal cual", async () => {
    const r = hostErrorResponse(new SandboxHostError("GET", "/x", 404, '{"error":"sandbox not found"}'))!;
    expect(r.status).toBe(404);
  });
  it("503 'not running yet' del host → 409 SandboxNotReady con el status", async () => {
    const r = hostErrorResponse(
      new SandboxHostError("POST", "/v1/sandbox/x/exec", 503, '{"error":"sandbox not running yet (status=starting)"}\n')
    )!;
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "SandboxNotReady", status: "starting" });
  });
  it("503 'sandbox not running' del /bg también es SandboxNotReady", async () => {
    const r = hostErrorResponse(new SandboxHostError("POST", "/x/exec/background", 503, '{"error":"sandbox not running"}'))!;
    expect(r.status).toBe(409);
  });
});
