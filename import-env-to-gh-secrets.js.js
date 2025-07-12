import { readFile } from "fs/promises";
import { execSync } from "child_process";

const envFile = ".env";

let content;
try {
  content = await readFile(envFile, "utf-8");
} catch (e) {
  console.error(`No se encontró el archivo ${envFile}`);
  process.exit(1);
}

const lines = content.split("\n");

for (const line of lines) {
  if (!line.trim() || line.trim().startsWith("#")) continue;

  const [key, ...rest] = line.split("=");
  const value = rest.join("=").trim();

  if (key && value) {
    try {
      console.log(`Añadiendo secret: ${key}`);
      execSync(
        `gh secret set ${key.trim()} --body "${value.replace(/"/g, '\\"')}"`,
        { stdio: "inherit" }
      );
    } catch (err) {
      console.error(`Error añadiendo ${key}:`, err.message);
    }
  }
}
