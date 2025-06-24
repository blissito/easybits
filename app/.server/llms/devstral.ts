// const MODEL = "qwen3:8b";
// const MODEL = "phi4:14b";
// const MODEL = "gemma3:1b";
const MODEL = "mistral-small3.2:24b";
const DEV_MODEL = "llama3.2:3b";
// const MODEL = "llama3.2:3b";
// const DEV_MODEL = "gemma3:4b";
// const MODEL = "deepseek-coder-v2:16b";
// const MODEL = "deepseek-r1:8b";

export const fetchInternalOllama = (
  prompt: string,
  stream: boolean = false
) => {
  const isDev = process.env.NODE_ENV === "development";
  const url = isDev
    ? "http://localhost:11434/api/generate"
    : "http://ollama-old.flycast/api/generate";

  console.log("ABout to:", url, "with::", prompt, "and::", MODEL);

  return fetch(url, {
    body: JSON.stringify({
      prompt,
      stream,
      model: isDev ? DEV_MODEL : MODEL,
      // model: isDev ? MODEL : "phi4:14b",
      think: false, // quen3:8b puede pensar
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "post",
  });
};

// @todo for chat
export const fetchInternalOllamaChat = (chat: string) => {};
