import { describe, it, expect } from "vitest";
import { buildRunEnv, buildSecretEnv } from "~/.server/core/agentOperations";

// agent_run entregaba los secretos como `env` de un exec, así que quedaban en
// /proc/<pid>/environ durante todo el run: cualquier proceso de la caja —
// incluido el código que el propio agente decidiera escribir— podía leerlos con
// un `cat`. Ahora van por archivo en tmpfs, y el script los carga y lo borra.
//
// Estos tests fijan la SEPARACIÓN. Volver a meter un secreto en buildRunEnv es
// una línea, no rompe nada visible, y reabre el agujero entero.
describe("agent_run: control por env, secretos por archivo", () => {
  const params = { prompt: "hola", model: "claude-sonnet-5" } as any;

  it("el env del exec no lleva ninguna credencial", () => {
    const env = buildRunEnv(params);
    const names = Object.keys(env);
    for (const forbidden of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "CLAUDE_CODE_OAUTH_TOKEN",
    ]) {
      expect(names).not.toContain(forbidden);
    }
    // Lo que sí debe llevar: sólo control, más la RUTA del archivo (que no es
    // un secreto — el secreto es el contenido, y vive segundos).
    expect(names).toContain("SECRETS_PATH");
    expect(names).toContain("PROMPT_B64");
  });

  it("un secreto del usuario nunca aparece en el env de control", () => {
    const env = buildRunEnv(params);
    expect(JSON.stringify(env)).not.toContain("sk-ant-test");
    const secretEnv = buildSecretEnv({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(secretEnv.ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });

  it("emite SOLO una de las dos variables de auth", () => {
    // Con ambas puestas el SDK prefiere ANTHROPIC_API_KEY y elegiría la
    // equivocada: un usuario con plan Max acabaría pagando por token.
    const oauth = buildSecretEnv({ CLAUDE_CODE_OAUTH_TOKEN: "oat_x" });
    expect(oauth.ANTHROPIC_AUTH_TOKEN).toBe("oat_x");
    expect(oauth.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("los secretos de usuario pasan íntegros, sin los de auth duplicados", () => {
    const out = buildSecretEnv({
      CLAUDE_CODE_OAUTH_TOKEN: "oat_x",
      MI_TOKEN: "valor",
    });
    expect(out.MI_TOKEN).toBe("valor");
    expect(out.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });
});
