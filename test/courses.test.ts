import { describe, expect, it } from "vitest";
import { listCourses, VERIFY_KINDS } from "../app/.server/courses";
import { courseStatus, certificateToken, parseCertificateToken, MIN_LESSONS_FOR_CERTIFICATE } from "../app/.server/core/courseProgress";

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

  it("todo curso publicado certifica sólo completo y con el mínimo de lecciones", async () => {
    const all = Object.fromEntries(VERIFY_KINDS.map((k) => [k, true])) as any;
    const none = Object.fromEntries(VERIFY_KINDS.map((k) => [k, false])) as any;
    for (const c of await listCourses()) {
      expect(c.lessons.length).toBeGreaterThanOrEqual(MIN_LESSONS_FOR_CERTIFICATE);
      const read = new Set(c.lessons.map((l) => l.id));
      expect(courseStatus(c, all, read).certificate.eligible).toBe(true);
      // leer todo no basta si las verificables no se cumplen
      if (c.lessons.some((l) => l.verify)) {
        const st = courseStatus(c, none, read).certificate;
        expect(st.eligible).toBe(false);
        if (!st.eligible) expect(st.reason).toBe("incomplete");
      }
    }
  });

  it("un curso corto no emite certificado aunque esté al 100%", async () => {
    const vende = (await listCourses()).find((c) => c.slug === "vende-tu-agente")!;
    const short = { ...vende, lessons: vende.lessons.slice(0, 1) };
    const all = Object.fromEntries(VERIFY_KINDS.map((k) => [k, true])) as any;
    const st = courseStatus(short, all, new Set(short.lessons.map((l) => l.id)));
    expect(st.percent).toBe(100);
    expect(st.certificate.eligible).toBe(false);
    if (!st.certificate.eligible) expect(st.certificate.reason).toBe("too_short");
  });

  it("el token del certificado se verifica y no se puede reusar en otro curso", () => {
    const t = certificateToken("64a000000000000000000001", "arranca");
    expect(parseCertificateToken(t, "arranca")).toBe("64a000000000000000000001");
    expect(parseCertificateToken(t, "vende-tu-agente")).toBeNull();
    expect(parseCertificateToken("x.y", "arranca")).toBeNull();
  });
});
