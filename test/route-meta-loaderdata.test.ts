import { describe, it, expect } from "vitest";
import { meta } from "~/routes/docs";

describe("docs meta usa loaderData (react-router v8)", () => {
  it("la descripción toma toolCount de loaderData, no de data", () => {
    const tags = (meta as any)({ loaderData: { toolCount: 250 }, data: undefined, params: {}, location: {}, matches: [] } as any);
    const desc = tags.find((t: any) => t.name === "description")?.content ?? "";
    expect(desc).toContain("250 tools");
  });
});
