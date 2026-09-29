import { test } from "node:test";
import assert from "node:assert/strict";
import { newer } from "./update.ts";

test("newer compara x.y.z como números", () => {
  assert.equal(newer("0.10.0", "0.9.1"), true);
  assert.equal(newer("0.9.1", "0.10.0"), false);
  assert.equal(newer("1.0.0", "1.0.0"), false);
  assert.equal(newer("0.8.1", "0.8.0"), true);
});
