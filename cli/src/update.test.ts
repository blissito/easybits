import { test } from "node:test";
import assert from "node:assert/strict";
import { newer } from "./update.ts";

test("newer compara x.y.z como números", () => {
  assert.equal(newer("0.10.0", "0.9.1"), true);
  assert.equal(newer("0.9.1", "0.10.0"), false);
  assert.equal(newer("1.0.0", "1.0.0"), false);
  assert.equal(newer("0.8.1", "0.8.0"), true);
});

test("cacheFresh: una hora, y un caché más viejo que lo instalado vuelve a preguntar", async () => {
  const { cacheFresh } = await import("./update.ts");
  const now = 1_000_000_000;
  assert.equal(cacheFresh({ latest: "0.15.0", checkedAt: now - 30 * 60 * 1000 }, "0.15.0", now), true);
  assert.equal(cacheFresh({ latest: "0.15.0", checkedAt: now - 61 * 60 * 1000 }, "0.15.0", now), false);
  // El caché dice 0.14 pero ya tienes la 0.15: no sabe nada.
  assert.equal(cacheFresh({ latest: "0.14.1", checkedAt: now - 60 * 1000 }, "0.15.0", now), false);
  assert.equal(cacheFresh({ latest: "0.16.0", checkedAt: now - 60 * 1000 }, "0.15.0", now), true);
  assert.equal(cacheFresh({}, "0.15.0", now), false);
  assert.equal(cacheFresh({ latest: "0.14.1", checkedAt: now - 60 * 1000 }, "dev", now), true);
});
