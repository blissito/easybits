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

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const model =
    process.env.OPENROUTER_MODEL ||
    // "google/gemini-2.5-flash-lite-preview-06-17" // $0.40/M output tokens
    // "mistralai/mistral-nemo" // $0.011/M output tokens
    //   "anthropic/claude-sonnet-4" // carísimo $15/Mtokens
    //   'qwen/qwen-2.5-7b-instruct' //$0.10/M output tokens
    //   'meta-llama/llama-3.3-70b-instruct' //$0.12/M output tokens
    // "meta-llama/llama-4-maverick" // $0.60/M output tokens GRAN CONTEXTO
    // FREE MODELS::
    // "deepseek/deepseek-chat-v3-0324:free"; // SLOW
    // "deepseek/deepseek-chat:free"; // GOOD SPEED
    // "google/gemini-2.0-flash-exp:free"; // GOOD SPEED
    // "qwen/qwen3-32b:free";
    // "mistralai/mistral-nemo:free"; // MUY BURRO
    // "deepseek/deepseek-r1-0528-qwen3-8b:free"; // MASOMENO
    "google/gemma-3-27b-it:free"; // MUY BUENO

  const body: {
    model: string;
    stream: boolean;
    messages?: { role: string; content: string }[];
    prompt?: string;
  } = {
    model,
    stream,
  };

  if (messages) {
    body.messages = messages;
  }
  if (prompt) {
    body.prompt = prompt;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return { response, messages, prompt, stream, success: response.ok };
  } catch (e) {
    console.error("OPENROUTER_ERROR::\n", e);
    if (e instanceof Error) {
      console.error(e.message);
      return {
        error: e.message,
        messages,
        prompt,
        stream,
        success: false,
      };
    } else {
      console.error(e);
      return {
        error: String(e),
        messages,
        prompt,
        stream,
        success: false,
      };
    }
  }
};
