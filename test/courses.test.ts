import { describe, expect, it } from "vitest";
import { listCourses, VERIFY_KINDS } from "../app/.server/courses";
import { courseStatus, certificateToken, parseCertificateToken } from "../app/.server/core/courseProgress";

describe("academia: cursos en disco", () => {
  it("cada curso tiene lecciones con frontmatter válido", async () => {
    const courses = await listCourses();
    expect(courses.map((c) => c.slug)).toEqual(["arranca", "agente-en-produccion", "vende-tu-agente"]);
    for (const c of courses) {
      expect(c.title).toBeTruthy();
      expect(c.lessons.length).toBeGreaterThan(0);
      for (const l of c.lessons) {
        expect(l.title).toBeTruthy();
        expect(l.minutes).toBeGreaterThan(0);
        if (l.verify) expect(VERIFY_KINDS).toContain(l.verify);
        expect(l.id).toBe(`${c.slug}/${l.slug}`);
      }
    }
  });

  it("arranca se completa sólo con hechos de la cuenta", async () => {
    const arranca = (await listCourses()).find((c) => c.slug === "arranca")!;
    const none = Object.fromEntries(VERIFY_KINDS.map((k) => [k, false])) as any;
    expect(courseStatus(arranca, none, new Set()).percent).toBe(0);
    const all = Object.fromEntries(VERIFY_KINDS.map((k) => [k, true])) as any;
    expect(courseStatus(arranca, all, new Set()).percent).toBe(100);
    // marcar "leída" no cuenta para una lección verificada
    const read = new Set(arranca.lessons.map((l) => l.id));
    expect(courseStatus(arranca, none, read).done).toBe(0);
  });

  it("el token del certificado se verifica y no se puede reusar en otro curso", () => {
    const t = certificateToken("64a000000000000000000001", "arranca");
    expect(parseCertificateToken(t, "arranca")).toBe("64a000000000000000000001");
    expect(parseCertificateToken(t, "vende-tu-agente")).toBeNull();
    expect(parseCertificateToken("x.y", "arranca")).toBeNull();
  });
});
