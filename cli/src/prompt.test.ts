import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand } from "./prompt.ts";

test("applyCommand: quita --dry-run y sólo sin terminal agrega --yes donde se confirma", () => {
  const argv = ["db", "rm", "leads", "--dry-run"];
  assert.equal(applyCommand(argv, { headless: false, needsYes: true }), "easybits db rm leads");
  assert.equal(applyCommand(argv, { headless: true, needsYes: true }), "easybits db rm leads --yes");
  // Una hoja que no confirma no acepta --yes: agregarlo la rompería con «Unknown option».
  assert.equal(applyCommand(["agents", "set", "helper", "--prompt-file", "P.md", "--dry-run"], { headless: true }), "easybits agents set helper --prompt-file P.md");
  // Si ya venía --yes / -y, no se duplica.
  assert.equal(applyCommand(["apply", "./helper", "--dry-run", "-y"], { headless: true, needsYes: true }), "easybits apply ./helper -y");
  // Lo que lleva espacios o comillas sale entrecomillado para el shell.
  assert.equal(applyCommand(["agents", "set", "x", "--prompt", "it's ok", "--dry-run"], { headless: false }), `easybits agents set x --prompt 'it'\\''s ok'`);
});
