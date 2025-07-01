type FetchOpenRouterResponse = {
  response?: Response;
  messages?: { role: string; content: string }[];
  prompt?: string;
  stream: boolean;
  success: boolean;
  error?: string;
};

export const fetchOpenRouter = async ({
  prompt,
  messages,
  stream = false,
}:
  | {
      messages: { role: string; content: string }[];
      prompt?: string;
      stream?: boolean;
    }
  | {
      prompt: string;
      messages?: { role: string; content: string }[];
      stream?: boolean;
    }): Promise<FetchOpenRouterResponse> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  // Modelos a intentar en orden
  const models = [
    process.env.OPENROUTER_MODEL || "google/gemma-3-27b-it:free", // MUY BUENO
    "meta-llama/llama-4-maverick", // $0.60/M output tokens GRAN CONTEXTO
    "anthropic/claude-sonnet-4", // carísimo $15/Mtokens
    // "google/gemini-2.5-flash-lite-preview-06-17" // $0.40/M output tokens
    // "mistralai/mistral-nemo" // $0.011/M output tokens
    //   'meta-llama/llama-3.3-70b-instruct' //$0.12/M output tokens
    // FREE MODELS::
    // "deepseek/deepseek-chat-v3-0324:free"; // SLOW
    // "deepseek/deepseek-chat:free"; // GOOD SPEED
    // "google/gemini-2.0-flash-exp:free"; // GOOD SPEED
    // "qwen/qwen3-32b:free";
    // "mistralai/mistral-nemo:free"; // MUY BURRO
    // "deepseek/deepseek-r1-0528-qwen3-8b:free"; // MASOMENO
  ];

  const bodyBase = {
    stream,
    messages: [] as any[],
    prompt: "",
  };
  if (messages) bodyBase.messages = messages;
  if (prompt) bodyBase.prompt = prompt;

  let lastError: any = null;
  for (const model of models) {
    const body = { ...bodyBase, model };
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        return { response, messages, prompt, stream, success: true };
      } else {
        lastError = `OpenRouter error with model ${model}: ${response.status} ${response.statusText}`;
      }
    } catch (e) {
      lastError = e;
    }
  }
  // Si todos fallan
  return {
    error: lastError ? String(lastError) : "Unknown error",
    messages,
    prompt,
    stream,
    success: false,
  };
};
