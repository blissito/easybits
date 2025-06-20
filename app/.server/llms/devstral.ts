export const fetchInternalOllama = (prompt: string) => {
  return fetch("http://ollama-old.flycast/api/generate", {
    method: "post",
    body: JSON.stringify({
      prompt,
      stream: "false",
      model: "devstral:24b-small-2505-q8_0",
    }),
  });
};
