type FetchOpenRouterResponse = {
  response?: Response;
  messages?: { role: string; content: string }[];
  prompt?: string;
  stream: boolean;
  success: boolean;
  data?: any;
  error?: string;
};

export const fetchOpenRouter = async ({
  prompt,
  messages,
  stream = false,
  model,
  // herramientas
  tools,
  tool_choice = 'auto'
}:
  | {
    tools?: any;
    tool_choice?: 'auto' | {
    type: "function";
    function: {
      name: string
    }
  };
      model?: string;
      messages: { role: string; content: string }[];
      prompt?: string;
      stream?: boolean;
    }
  | {
    tools?: any;
    tool_choice?: 'auto' | {
    type: "function";
    function: {
      name: string
    }
  };
      model?: string;
      prompt: string;
      messages?: { role: string; content: string }[];
      stream?: boolean;
    }): Promise<FetchOpenRouterResponse> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  // Modelos a intentar en orden
  const models = [
    model || "google/gemma-3-27b-it:free", // Muy bueno para descripción, no para chat.
    "deepseek/deepseek-chat:free", // // Muy bueno para chat, no para descripción.
    "meta-llama/llama-4-maverick", // $0.60/M output tokens GRAN CONTEXTO
    "anthropic/claude-sonnet-4", // carísimo $15/Mtokens MUY SMART EL PUTO!
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

  let lastError: any = null;
  for (const model of models) {
    const body: any = { model, stream,

      // herramientas
      tools,
      tool_choice

     };
    if (messages) body.messages = messages;
    if (prompt) body.prompt = prompt;
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
      // @todo what's the shape of response and its data? 
      if (response.ok) {
        // When streaming, don't parse the response as JSON
        if (stream) {
          return { 
            stream, 
            prompt, 
            messages, 
            response,
            success: true
          };
        }
        // For non-streaming responses, parse the JSON
        return { 
          stream, 
          prompt, 
          messages, 
          response,
          success: true,
          data: await response.json()
        };
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
