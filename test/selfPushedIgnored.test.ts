import { describe, it, expect, vi } from "vitest";

vi.mock("../app/.server/core/releaseOperations", async (orig) => ({
  ...(await orig<typeof import("../app/.server/core/releaseOperations")>()),
  launchApp: vi.fn(async () => ({ version: 1 })),
}));

import { acceptPush, markSelfPushed } from "../app/.server/core/pushDeployOperations";

const row = {
  ownerId: "o1",
  status: "running",
  runspec: { appDir: "/app", source: { repo: "https://github.com/a/b.git", branch: "main", installationId: 7 } },
};
const push = (after: string) => ({ ref: "refs/heads/main", after, head_commit: { message: "x" } });

describe("«Publicar» de un sitio conectado a GitHub", () => {
  it("ignora el webhook del commit que EasyBits mismo empujó y desplegó", () => {
    markSelfPushed("sb_1", "abc123");
    const r = acceptPush("sb_1", row, push("abc123"));
    expect(r.body.ignored).toBe("published from EasyBits");
  });

  it("un push de otro commit sí despliega", () => {
    markSelfPushed("sb_2", "abc123");
    const r = acceptPush("sb_2", row, push("def456"));
    expect(r.status).toBe(202);
  });
});
