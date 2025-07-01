type FetchOpenRouterResponse = {
  response?: Response;
  messages?: { role: string; content: string }[];
  prompt?: string;
  stream: boolean;
  success: boolean;
  error?: string;
};

export const fetchOpenRouter = async (
  prompt?: string,
  stream: boolean = true,
  messages?: { role: string; content: string }[]
): Promise<FetchOpenRouterResponse> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const model =
    process.env.OPENROUTER_MODEL ||
    "mistralai/mistral-small-3.1-24b-instruct:free";
  const body = {
    model,
    messages: [{ role: "user", content: prompt || "kiubo! 👋🏼" }],
    stream,
  };

  if (messages) {
    body.messages = messages;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return { response, messages, prompt, stream, success: response.ok };
  } catch (e) {
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
