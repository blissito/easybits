import { describe, it, expect } from "vitest";
import { hostErrorResponse, SandboxHostError } from "~/.server/core/sandboxOperations";

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
  it("un 502 sin status interior sigue siendo nuestro 500", () => {
    expect(hostErrorResponse(new SandboxHostError("GET", "/x", 502, '{"error":"agent unreachable: dial tcp"}'))).toBeNull();
  });
  it("un 5xx interior no se reenvía", () => {
    expect(hostErrorResponse(new SandboxHostError("GET", "/x", 502, '{"error":"agent /exec → 500: boom"}'))).toBeNull();
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
