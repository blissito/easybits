export const useDevstral = <T extends { text: string }>() => {
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
      data: (resp as Response).json() as Promise<T>, // promise
    };
  };

  return {
    async getAnswer(prompt: string) {
      const { ok, data } = await queryLLM(prompt);
      if (ok) return data as Promise<T>;
    },
  };
};
