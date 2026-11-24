import { describe, it, expect, vi } from "vitest";

vi.mock("~/.server/db", () => ({ db: {} }));
vi.mock("~/.server/emails/sendTransactional", () => ({ sendTransactional: vi.fn() }));
vi.mock("~/.server/core/releaseOperations", () => ({ restartMachine: vi.fn() }));
vi.mock("~/.server/core/sandboxOperations", () => ({ callHost: vi.fn() }));
vi.mock("~/.server/core/externalMachine", () => ({ NOT_EXTERNAL: {} }));

const { probeConfirmed } = await import("~/.server/core/hostingMonitorOperations");

// Una caja que despierta lento no es una caída: la segunda sonda decide.
describe("probeConfirmed", () => {
  it("un timeout suelto seguido de un 200 NO es caída", async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce({ status: undefined, error: "aborted" })
      .mockResolvedValueOnce({ status: 200, error: undefined });
    const r = await probeConfirmed("x.test", probe as any, 0);
    expect(r.status).toBe(200);
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it("si responde a la primera no reintenta", async () => {
    const probe = vi.fn().mockResolvedValue({ status: 302, error: undefined });
    await probeConfirmed("x.test", probe as any, 0);
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("dos fallos seguidos sí es caída", async () => {
    const probe = vi.fn().mockResolvedValue({ status: 502, error: undefined });
    const r = await probeConfirmed("x.test", probe as any, 0);
    expect(r.status).toBe(502);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
