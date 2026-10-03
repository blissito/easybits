import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Base en memoria: sólo lo que createWebsite/updateWebsite tocan ─────────
type Site = {
  id: string; name: string; slug: string; ownerId: string; status: string; prefix: string;
  previousSlugs: string[]; subdomainEnabled: boolean; deletedAt: Date | null;
  fileCount: number; totalSize: number;
};
let sites: Site[] = [];
let seq = 0;

function matches(s: Site, where: any): boolean {
  for (const [k, v] of Object.entries(where ?? {})) {
    const val = (s as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("not" in v && val === (v as any).not) return false;
      if ("has" in v && !(val ?? []).includes((v as any).has)) return false;
    } else if (val !== v) return false;
  }
  return true;
}

vi.mock("~/.server/db", () => ({
  db: {
    website: {
      findFirst: vi.fn(async ({ where }) => sites.find((s) => matches(s, where)) ?? null),
      findMany: vi.fn(async ({ where }) => sites.filter((s) => matches(s, where))),
      findUnique: vi.fn(async ({ where }) => sites.find((s) => s.id === where.id) ?? null),
      create: vi.fn(async ({ data }) => {
        if (sites.some((s) => s.ownerId === data.ownerId && s.slug === data.slug)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const site: Site = {
          id: `w${++seq}`, status: "ACTIVE", previousSlugs: [], subdomainEnabled: false,
          deletedAt: null, fileCount: 0, totalSize: 0, ...data,
        };
        sites.push(site);
        return site;
      }),
      update: vi.fn(async ({ where, data }) => {
        const s = sites.find((x) => x.id === where.id)!;
        if (data.slug && sites.some((o) => o.id !== s.id && o.ownerId === s.ownerId && o.slug === data.slug)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        Object.assign(s, data);
        return { ...s };
      }),
    },
    file: { aggregate: vi.fn(async () => ({ _count: 0, _sum: { size: 0 } })) },
  },
}));
vi.mock("~/.server/webhooks", () => ({ dispatchWebhooks: vi.fn() }));
vi.mock("~/lib/fly_certs/certs_getters", () => ({ createHost: vi.fn(), removeHost: vi.fn() }));

const { checkWebsiteSlug } = await import("~/.server/core/websiteSlug");
const { createWebsite, updateWebsite } = await import("~/.server/core/operations");

const ctx = (userId: string) => ({ user: { id: userId }, scopes: ["READ", "WRITE", "DELETE"] }) as any;

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof Response) return { status: e.status, body: await e.json() };
    throw e;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  sites = [];
  seq = 0;
});

describe("checkWebsiteSlug", () => {
  it.each(["mi-tienda", "abc", "a1-b2-c3", "rio-durmiente", "x".repeat(60), "  Mi-Tienda  "])("acepta %j", (s) => {
    expect(checkWebsiteSlug(s).ok).toBe(true);
  });

  it("normaliza a minúsculas y sin espacios", () => {
    expect(checkWebsiteSlug("  Mi-Tienda ")).toEqual({ ok: true, slug: "mi-tienda" });
  });

  it.each([
    "ab", "x".repeat(61), "-tienda", "tienda-", "mi--tienda", "mi_tienda", "mi tienda",
    "tienda!", "ñandú", "", 42, null,
  ])("rechaza %j", (s) => {
    expect(checkWebsiteSlug(s).ok).toBe(false);
  });

  it.each(["api", "admin", "www", "app", "assets", "static", "dashboard", "login"])("rechaza el reservado %j", (s) => {
    const r = checkWebsiteSlug(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reserved/);
  });
});

describe("createWebsite con slug", () => {
  it("usa el slug elegido", async () => {
    const w = await createWebsite(ctx("u1"), { name: "Tienda", slug: "mi-tienda" });
    expect(w.slug).toBe("mi-tienda");
    expect(w.url).toBe("https://www.easybits.cloud/s/mi-tienda");
  });

  it("sin slug genera uno válido", async () => {
    const w = await createWebsite(ctx("u1"), { name: "Tienda" });
    expect(checkWebsiteSlug(w.slug).ok).toBe(true);
  });

  it("400 slug_invalid", async () => {
    expect(await errorOf(createWebsite(ctx("u1"), { name: "T", slug: "Mi Tienda!" }))).toMatchObject({
      status: 400, body: { error: "slug_invalid" },
    });
  });

  it("409 slug_taken si otro dueño lo usa", async () => {
    await createWebsite(ctx("u1"), { name: "A", slug: "mi-tienda" });
    expect(await errorOf(createWebsite(ctx("u2"), { name: "B", slug: "mi-tienda" }))).toMatchObject({
      status: 409, body: { error: "slug_taken" },
    });
  });

  it("reusa el slug de un sitio propio borrado (libera la fila vieja)", async () => {
    const old = await createWebsite(ctx("u1"), { name: "A", slug: "mi-tienda" });
    Object.assign(sites.find((s) => s.id === old.id)!, { status: "DELETED", deletedAt: new Date() });
    const w = await createWebsite(ctx("u1"), { name: "B", slug: "mi-tienda" });
    expect(w.slug).toBe("mi-tienda");
    expect(sites.find((s) => s.id === old.id)!.slug).not.toBe("mi-tienda");
  });
});

describe("updateWebsite con slug", () => {
  it("cambia el slug, devuelve url y guarda el viejo como alias", async () => {
    const w = await createWebsite(ctx("u1"), { name: "A", slug: "viejo-slug" });
    const u = await updateWebsite(ctx("u1"), w.id, { slug: "nuevo-slug" });
    expect(u.slug).toBe("nuevo-slug");
    expect(u.url).toBe("https://www.easybits.cloud/s/nuevo-slug");
    expect(u.previousSlugs).toEqual(["viejo-slug"]);
  });

  it("409 si lo tiene otro sitio vivo", async () => {
    await createWebsite(ctx("u2"), { name: "Otro", slug: "ocupado" });
    const w = await createWebsite(ctx("u1"), { name: "A", slug: "mio-uno" });
    expect(await errorOf(updateWebsite(ctx("u1"), w.id, { slug: "ocupado" }))).toMatchObject({
      status: 409, body: { error: "slug_taken" },
    });
  });

  it("400 si es reservado", async () => {
    const w = await createWebsite(ctx("u1"), { name: "A", slug: "mio-uno" });
    expect(await errorOf(updateWebsite(ctx("u1"), w.id, { slug: "admin" }))).toMatchObject({
      status: 400, body: { error: "slug_invalid" },
    });
  });

  it("el mismo slug es un no-op (no se vuelve alias de sí mismo)", async () => {
    const w = await createWebsite(ctx("u1"), { name: "A", slug: "mio-uno" });
    const u = await updateWebsite(ctx("u1"), w.id, { slug: "mio-uno" });
    expect(u.slug).toBe("mio-uno");
    expect(u.previousSlugs).toEqual([]);
  });

  it("tomar un slug que era alias de otro sitio se lo quita a ese", async () => {
    const a = await createWebsite(ctx("u1"), { name: "A", slug: "libre-ya" });
    await updateWebsite(ctx("u1"), a.id, { slug: "a-nuevo" });
    const b = await createWebsite(ctx("u2"), { name: "B", slug: "b-uno" });
    await updateWebsite(ctx("u2"), b.id, { slug: "libre-ya" });
    expect(sites.find((s) => s.id === a.id)!.previousSlugs).toEqual([]);
  });
});
