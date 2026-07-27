import { describe, it, expect, vi, beforeEach } from "vitest";

// La resolución del motor consulta la DB y el catálogo de capacidades; acá sólo nos importa
// la DECISIÓN (kokoro vs elevenlabs), así que ambos van mockeados.
const findUnique = vi.fn();
const resolveGroupCodeCaps = vi.fn();

vi.mock("~/.server/db", () => ({ db: { fleetAgent: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("~/.server/core/fleetAgentOperations", () => ({
  resolveGroupCodeCaps: (...a: unknown[]) => resolveGroupCodeCaps(...a),
}));
vi.mock("~/.server/core/sandboxOperations", () => ({ ensureServiceBox: vi.fn(), touchServiceBox: vi.fn() }));
vi.mock("~/.server/core/fleetServiceOperations", () => ({ ensureServiceBox: vi.fn(), touchServiceBox: vi.fn(), buildUrls: vi.fn() }));

const { resolveVoiceEngine } = await import("~/.server/core/fleetVoice");

describe("resolveVoiceEngine — ElevenLabs sólo si el canal lo tiene encendido", () => {
  beforeEach(() => {
    findUnique.mockReset();
    resolveGroupCodeCaps.mockReset();
    findUnique.mockResolvedValue({ mcpCatalog: null, groupConfigs: {} });
  });

  it("sin fleetAgentId/cfgId → kokoro (llamadas viejas, comportamiento idéntico)", async () => {
    const e = await resolveVoiceEngine("owner-1");
    expect(e.engine).toBe("kokoro");
    expect(resolveGroupCodeCaps).not.toHaveBeenCalled();
  });

  it("capacidad apagada (sin env) → kokoro", async () => {
    resolveGroupCodeCaps.mockResolvedValue(null);
    const e = await resolveVoiceEngine("owner-1", { fleetAgentId: "fa1", cfgId: "waba:int1" });
    expect(e.engine).toBe("kokoro");
  });

  it("capacidad encendida sin llave → kokoro (nunca intentamos sin credencial)", async () => {
    resolveGroupCodeCaps.mockResolvedValue({ env: {}, skillDocs: [] });
    const e = await resolveVoiceEngine("owner-1", { fleetAgentId: "fa1", cfgId: "waba:int1" });
    expect(e.engine).toBe("kokoro");
  });

  it("con llave → elevenlabs, y usa la voz configurada del canal", async () => {
    resolveGroupCodeCaps.mockResolvedValue({
      env: { ELEVENLABS_API_KEY: "sk-test", ELEVENLABS_VOICE_ID: "voice-abc" },
      skillDocs: [],
    });
    const e = await resolveVoiceEngine("owner-1", { fleetAgentId: "fa1", cfgId: "waba:int1" });
    expect(e).toMatchObject({ engine: "elevenlabs", apiKey: "sk-test", voiceId: "voice-abc" });
  });

  it("la voz explícita del llamador gana sobre la del canal", async () => {
    resolveGroupCodeCaps.mockResolvedValue({
      env: { ELEVENLABS_API_KEY: "sk-test", ELEVENLABS_VOICE_ID: "voice-canal" },
      skillDocs: [],
    });
    const e = await resolveVoiceEngine("owner-1", { fleetAgentId: "fa1", cfgId: "waba:int1", voice: "voice-explicita" });
    expect((e as { voiceId: string }).voiceId).toBe("voice-explicita");
  });

  it("si la resolución revienta → kokoro, nunca propaga (la voz no puede tumbar el turno)", async () => {
    resolveGroupCodeCaps.mockRejectedValue(new Error("boom"));
    const e = await resolveVoiceEngine("owner-1", { fleetAgentId: "fa1", cfgId: "waba:int1" });
    expect(e.engine).toBe("kokoro");
  });
});
