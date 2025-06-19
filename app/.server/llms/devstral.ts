export const fetchInternalOllama = (prompt: string) => {
  return fetch(
    "http://ollama-blissmo-billowing-water-953.flycast/api/generate",
    {
      method: "post",
      body: new URLSearchParams({
        prompt,
        stream: "false",
        model: "devstral:24b-small-2505-q8_0",
      }),
    }
  );
};
