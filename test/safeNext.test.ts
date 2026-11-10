import { describe, expect, it } from "vitest";
import { toDocumentPath } from "~/lib/safeNext";

describe("toDocumentPath (next del login)", () => {
  it("quita el sufijo .data de single fetch", () => {
    expect(toDocumentPath("/dash.data")).toBe("/dash");
    expect(toDocumentPath("/dash/_.data")).toBe("/dash/");
    expect(toDocumentPath("/_root.data")).toBe("/");
    expect(toDocumentPath("/dash/flota.data?_routes=routes%2Fx&a=1")).toBe("/dash/flota?a=1");
  });
  it("conserva rutas normales con query", () => {
    expect(toDocumentPath("/dash?welcome=trial&session_id=cs_1")).toBe("/dash?welcome=trial&session_id=cs_1");
  });
  it("rechaza vacíos y externos", () => {
    expect(toDocumentPath(null)).toBe("/dash");
    expect(toDocumentPath("null")).toBe("/dash");
    expect(toDocumentPath("//evil.com/x")).toBe("/dash");
    expect(toDocumentPath("https://evil.com")).toBe("/dash");
  });
});
