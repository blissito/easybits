const badWords = [
  "puta",
  "puto",
  "mierda",
  "cabron",
  "pendejo",
  "coño",
  "joder",
  "gilipollas",
  "cabrón",
  "imbécil",
  "estúpido",
  "idiota",

  // ...agrega más según necesidad
];

export function censorBadWords(text: string): string {
  let censored = text;
  for (const word of badWords) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    censored = censored.replace(regex, "*".repeat(word.length));
  }
  return censored;
}
