import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock los dos sistemas de cobro que toca bill().
const mockIncrementLLM = vi.fn();
vi.mock("~/.server/llmTokenLimit", () => ({
  incrementLLMTokens: (...a: any[]) => mockIncrementLLM(...a),
  checkLLMTokenLimit: vi.fn(),
  formatTokens: (n: number) => String(n),
}));

const mockLogAiUsage = vi.fn();
const mockIncrementAiGen = vi.fn();
vi.mock("~/.server/aiGenerationLimit", () => ({
  logAiUsage: (...a: any[]) => mockLogAiUsage(...a),
  incrementAiGeneration: (...a: any[]) => mockIncrementAiGen(...a),
}));

const { bill } = await import("~/routes/api/v2/llm-proxy");

beforeEach(() => vi.clearAllMocks());

describe("bill (proxy LLM)", () => {
  it("cobra la cuota de tokens Y loguea analítica con tokens reales", () => {
    bill({ usage: { prompt_tokens: 1200, completion_tokens: 300 } }, "u1", "deepseek-chat");

    // Cobro real contra el bucket de tokens (input + output).
    expect(mockIncrementLLM).toHaveBeenCalledWith("u1", 1500);

    // Fila de analítica con input/output separados.
    expect(mockLogAiUsage).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        type: "llm.proxy",
        product: "compute",
        modelId: "deepseek-chat",
        inputTokens: 1200,
        outputTokens: 300,
      }),
    );

    // NUNCA debe tocar el bucket de créditos (evita doble cobro).
    expect(mockIncrementAiGen).not.toHaveBeenCalled();
  });

  it("sin usage o con 0 tokens no cobra ni loguea", () => {
    bill({}, "u1", "deepseek-chat");
    bill({ usage: { prompt_tokens: 0, completion_tokens: 0 } }, "u1", "deepseek-chat");
    expect(mockIncrementLLM).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
  });
});
