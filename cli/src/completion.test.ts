import { test } from "node:test";
import assert from "node:assert/strict";
import { completionFor, completionScript } from "./commands/completion.ts";
import { COMMANDS } from "./commands/index.ts";

const words = (w: string, cur = "") => completionFor(w ? w.split(" ") : [], cur, COMMANDS);

test("comandos, subcomandos y flags salen de la tabla", () => {
  const top = words("");
  assert.equal(top.kind, "words");
  assert.ok(top.kind === "words" && top.words.includes("agents") && top.words.includes("apply") && top.words.includes("completion"));
  assert.ok(top.kind === "words" && !top.words.some((w) => w.startsWith("__")));
  const subs = words("agents");
  assert.ok(subs.kind === "words" && subs.words.includes("export") && subs.words.includes("get"));
  assert.deepEqual(words("sb"), { kind: "words", words: ["ls", "create", "get", "exec", "logs", "files", "suspend", "resume", "destroy", "snapshot"] });
  const flags = words("apply ./x", "--");
  assert.ok(flags.kind === "words" && flags.words.includes("--prune") && flags.words.includes("--json"));
});

test("nombres donde va un recurso", () => {
  assert.deepEqual(words("agents get"), { kind: "names", ref: "agent" });
  assert.deepEqual(words("agent message"), { kind: "names", ref: "agent" });
  assert.deepEqual(words("agents get helper"), { kind: "words", words: [] });
  assert.deepEqual(words("sb exec"), { kind: "names", ref: "sandbox" });
  assert.deepEqual(words("sandboxes files ls"), { kind: "names", ref: "sandbox" });
  assert.deepEqual(words("db query"), { kind: "names", ref: "db" });
  assert.deepEqual(words("domains add"), { kind: "names", ref: "sandbox" });
  assert.deepEqual(words("apply ./x --agent"), { kind: "names", ref: "agent" });
  assert.deepEqual(words("agents create --like"), { kind: "names", ref: "agent" });
  // el valor de un flag con valor no cuenta como posicional
  assert.deepEqual(words("agents get --fields status"), { kind: "names", ref: "agent" });
});

test("completion y help", () => {
  assert.deepEqual(words("completion"), { kind: "words", words: ["zsh", "bash", "fish"] });
  const h = words("help");
  assert.ok(h.kind === "words" && h.words.includes("db"));
});

test("scripts: bash arma las palabras antes de cambiar IFS", () => {
  const b = completionScript("bash")!;
  assert.ok(b.indexOf("local words=") < b.indexOf("local IFS="));
  assert.match(completionScript("zsh")!, /compdef _easybits easybits/);
  assert.match(completionScript("fish")!, /complete -c easybits/);
  assert.equal(completionScript("tcsh"), null);
});
