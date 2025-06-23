export const fetchInternalOllama = (
  prompt: string,
  stream: boolean = false
) => {
  const isDev = process.env.NODE_ENV === "development";
  const url = isDev
    ? "http://localhost:11434/api/generate"
    : "http://ollama-old.flycast/api/generate";

  console.log(
    "ABout to:",
    url,
    "with::",
    prompt,
    "and::",
    isDev ? "llama3.2:3b" : "phi4:14b"
  );

  return fetch(url, {
    body: JSON.stringify({
      prompt,
      stream,
      model: isDev ? "llama3.2:3b" : "phi4:14b",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "post",
  });
};

// @todo for chat
export const fetchInternalOllamaChat = (chat: string) => {};
