export type OptionSpec = {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
  description?: string;
  /** Nombre del valor en la ayuda (`--port <port>`). */
  value?: string;
};

export type Options = Record<string, OptionSpec>;

export interface Ctx {
  json: boolean;
  token?: string;
  /** Posicionales después del comando y el subcomando. */
  args: string[];
  opts: Record<string, string | boolean | string[] | undefined>;
}

/** Una acción ejecutable: un comando sin subcomandos o un subcomando. */
export interface Leaf {
  summary: string;
  usage: string;
  examples?: string[];
  options?: Options;
  aliases?: string[];
  run(ctx: Ctx): Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  group: string;
  summary: string;
  /** Línea para la ayuda global, p. ej. "sandboxes <ls|create|…>". */
  synopsis: string;
  leaf?: Leaf;
  subs?: Record<string, Leaf>;
  /** Subcomando cuando no se pasa ninguno (compatibilidad: `easybits files`). */
  defaultSub?: string;
}
