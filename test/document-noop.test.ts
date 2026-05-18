// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/.server/db", () => {
  const findUnique = vi.fn();
  const update = vi.fn();
  return {
    db: { landing: { findUnique, update } },
  };
});

vi.mock("~/.server/apiAuth", () => ({
  requireScope: vi.fn(),
}));

vi.mock("~/.server/core/landingOperations", () => ({
  deployLanding: vi.fn(),
  unpublishLanding: vi.fn(),
}));

vi.mock("~/.server/core/aiKeyOperations", () => ({
  resolveAiKey: vi.fn(),
}));

vi.mock("~/.server/aiGenerationLimit", () => ({
  checkAiGenerationLimit: vi.fn(),
  incrementAiGeneration: vi.fn(),
}));

vi.mock("~/.server/aiModels", () => ({
  getAiModel: vi.fn(),
  resolveModelLocal: vi.fn(),
}));

vi.mock("@easybits.cloud/html-tailwind-generator/generateDocument", () => ({
  generateDocumentParallel: vi.fn(),
}));

vi.mock("@easybits.cloud/html-tailwind-generator/directions", () => ({
  GAMMA_LAYOUTS: {},
}));

vi.mock("@easybits.cloud/html-tailwind-generator/images", () => ({
  enrichImages: vi.fn(),
  findImageSlots: vi.fn(),
  generateSvg: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("~/.server/sanitizeColors", () => ({
  sanitizeSemanticColors: vi.fn((x: any) => x),
}));

vi.mock("~/.server/core/docEvents", () => ({
  docEvents: { emit: vi.fn() },
}));

vi.mock("~/.server/storage", () => ({
  getPlatformDefaultClient: vi.fn(),
  getPlatformPublicClient: vi.fn(),
  buildPublicAssetUrl: vi.fn(),
}));

vi.mock("~/.server/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  setPageHtml,
  replaceHtmlInPage,
  setSectionHtmlBySelector,
  updateDocument,
  getDocument,
} from "~/.server/core/documentOperations";
import { db } from "~/.server/db";
import { docEvents } from "~/.server/core/docEvents";

const VALID_ID = "0123456789abcdef01234567";
const PAGE_ID = "page-1";
const CTX = { user: { id: "owner-1" } } as any;

function makeDoc(html: string) {
  return {
    id: VALID_ID,
    ownerId: CTX.user.id,
    version: 4,
    name: "Doc",
    prompt: "",
    metadata: {},
    sections: [{ id: PAGE_ID, order: 0, html, name: "Page 1" }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setPageHtml no-op", () => {
  it("returns noop and skips db.update when html is identical", async () => {
    const html = "<section>hello</section>";
    (db.landing.findUnique as any).mockResolvedValue(makeDoc(html));

    const result = await setPageHtml(CTX, VALID_ID, PAGE_ID, html);

    expect(result).toMatchObject({ success: true, noop: true, pageId: PAGE_ID });
    expect(db.landing.update).not.toHaveBeenCalled();
    expect((docEvents.emit as any)).not.toHaveBeenCalled();
  });

  it("writes when html actually changed", async () => {
    (db.landing.findUnique as any).mockResolvedValue(makeDoc("<section>old</section>"));
    (db.landing.update as any).mockResolvedValue({ sections: [], updatedAt: new Date() });

    const result = await setPageHtml(CTX, VALID_ID, PAGE_ID, "<section>new</section>");

    expect((result as any).noop).toBeUndefined();
    expect(db.landing.update).toHaveBeenCalledTimes(1);
    expect(docEvents.emit).toHaveBeenCalledTimes(1);
  });
});

describe("replaceHtmlInPage no-op", () => {
  it("returns noop when old_html === new_html", async () => {
    const html = "<section><p>same</p></section>";
    (db.landing.findUnique as any).mockResolvedValue(makeDoc(html));

    const result = await replaceHtmlInPage(CTX, VALID_ID, PAGE_ID, "<p>same</p>", "<p>same</p>");

    expect(result).toMatchObject({ success: true, noop: true, pageId: PAGE_ID });
    expect(db.landing.update).not.toHaveBeenCalled();
  });

  it("writes when replacement produces different html", async () => {
    (db.landing.findUnique as any).mockResolvedValue(makeDoc("<section><p>old</p></section>"));
    (db.landing.update as any).mockResolvedValue({ sections: [], updatedAt: new Date() });

    const result = await replaceHtmlInPage(CTX, VALID_ID, PAGE_ID, "<p>old</p>", "<p>new</p>");

    expect((result as any).noop).toBeUndefined();
    expect(db.landing.update).toHaveBeenCalledTimes(1);
  });
});

describe("setSectionHtmlBySelector no-op", () => {
  it("returns noop when serialized result equals current html", async () => {
    const html = '<section class="root"><div class="hero">x</div></section>';
    (db.landing.findUnique as any).mockResolvedValue(makeDoc(html));

    const result = await setSectionHtmlBySelector(
      CTX,
      VALID_ID,
      PAGE_ID,
      ".hero",
      '<div class="hero">x</div>'
    );

    expect((result as any).noop).toBe(true);
    expect(db.landing.update).not.toHaveBeenCalled();
  });
});

describe("updateDocument no-op", () => {
  it("returns noop when no fields change", async () => {
    (db.landing.findUnique as any).mockResolvedValue(makeDoc("<section>x</section>"));

    const result = await updateDocument(CTX, VALID_ID, { name: "Doc" });

    expect((result as any).noop).toBe(true);
    expect(db.landing.update).not.toHaveBeenCalled();
  });

  it("writes when name actually changes", async () => {
    (db.landing.findUnique as any).mockResolvedValue(makeDoc("<section>x</section>"));
    (db.landing.update as any).mockResolvedValue({ sections: [], updatedAt: new Date() });

    const result = await updateDocument(CTX, VALID_ID, { name: "Other" });

    expect((result as any).noop).toBeUndefined();
    expect(db.landing.update).toHaveBeenCalledTimes(1);
  });

  it("writes when theme actually changes (no aliasing trap)", async () => {
    const doc = { ...makeDoc("<section>x</section>"), metadata: { theme: "default" } };
    (db.landing.findUnique as any).mockResolvedValue(doc);
    (db.landing.update as any).mockResolvedValue({ sections: [], updatedAt: new Date() });

    const result = await updateDocument(CTX, VALID_ID, { theme: "corporate" });

    expect((result as any).noop).toBeUndefined();
    expect(db.landing.update).toHaveBeenCalledTimes(1);
    const updateArg = (db.landing.update as any).mock.calls[0][0];
    expect(updateArg.data.metadata.theme).toBe("corporate");
  });

  it("returns noop when theme matches existing", async () => {
    const doc = { ...makeDoc("<section>x</section>"), metadata: { theme: "corporate" } };
    (db.landing.findUnique as any).mockResolvedValue(doc);

    const result = await updateDocument(CTX, VALID_ID, { theme: "corporate" });

    expect((result as any).noop).toBe(true);
    expect(db.landing.update).not.toHaveBeenCalled();
  });
});

describe("getDocument lightweight mode", () => {
  it("returns htmlLength and htmlHash without html when includeHtml is false", async () => {
    const html = "<section>hello</section>";
    (db.landing.findUnique as any).mockResolvedValue({
      ...makeDoc(html),
      websiteId: null,
    });

    const result: any = await getDocument(CTX, VALID_ID, { includeHtml: false });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].html).toBeUndefined();
    expect(result.sections[0].htmlLength).toBe(html.length);
    expect(result.sections[0].htmlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns full html by default", async () => {
    const html = "<section>hello</section>";
    (db.landing.findUnique as any).mockResolvedValue({
      ...makeDoc(html),
      websiteId: null,
    });

    const result: any = await getDocument(CTX, VALID_ID);

    expect(result.sections[0].html).toBe(html);
    expect(result.sections[0].htmlHash).toBeUndefined();
  });
});
