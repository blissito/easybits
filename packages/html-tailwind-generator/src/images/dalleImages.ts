/**
 * Generate an image using DALL-E 3 API.
 */
export async function generateImage(
  query: string,
  openaiApiKey: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: query,
      n: 1,
      size: "1792x1024",
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`DALL-E API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].url;
}
