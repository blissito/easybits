export const useDevstral = <T extends string>() => {
  const queryLLM = async (prompt: string) => {
    const action = "/api/v1/llms/devstral"; // action
    let resp: Partial<Response> = { ok: false, json: async () => {} };
    try {
      resp = await fetch(action, {
        method: "post",
        body: new URLSearchParams({ intent: "call_ollama", prompt }),
      });
      console.info("::API_RESPONSE::", resp.status, resp.statusText);
    } catch (e) {
      console.error("::ERROR_AL_CONSULTAR_AL_API::", e);
    }
    return {
      ok: resp.ok,
      data: (resp as Response).text() as Promise<T>, // promise
    };
  };

  const queryLLMStream = async (
    prompt: string,
    onChunk: (chunk: string) => void
  ) => {
    const action = "/api/v1/llms/devstral";
    try {
      const resp = await fetch(action, {
        method: "post",
        body: new URLSearchParams({ intent: "call_ollama", prompt }),
      });

      if (!resp.ok) return false;

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim() && line.startsWith("{")) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                onChunk(data.response);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      return true;
    } catch (e) {
      console.error("::ERROR_STREAM::", e);
      return false;
    }
  };

  return {
    async getAnswer(prompt: string) {
      const { ok, data } = await queryLLM(prompt);
      if (ok) return data as Promise<T>;
    },
    queryLLMStream, // ← Nueva función para streaming
  };
};
