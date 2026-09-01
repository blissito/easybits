import { describe, it, expect, vi } from "vitest";

// Solo lógica pura: buckets, bots y agregación. Es donde se puede estar midiendo
// mal sin que nada falle a gritos.
vi.mock("~/.server/db", () => ({ db: {} }));
vi.mock("~/.server/blogPosts", () => ({ listPublishedPosts: async () => [] }));

const { bucketSource, isBot, median, aggregate, isValidViewId } = await import(
  "~/.server/blog/postViews"
);

describe("bucketSource — de dónde vino el lector", () => {
  it("agrupa los buscadores", () => {
    expect(bucketSource("https://www.google.com/search?q=easybits")).toBe("google");
    expect(bucketSource("https://google.com.mx/")).toBe("google");
    expect(bucketSource("https://duckduckgo.com/")).toBe("google");
  });

  it("agrupa las redes", () => {
    expect(bucketSource("https://t.co/abc")).toBe("x");
    expect(bucketSource("https://x.com/alguien/status/1")).toBe("x");
    expect(bucketSource("https://twitter.com/alguien")).toBe("x");
    expect(bucketSource("https://lnkd.in/xyz")).toBe("linkedin");
    expect(bucketSource("https://www.reddit.com/r/programming/")).toBe("reddit");
    expect(bucketSource("https://news.ycombinator.com/item?id=1")).toBe("hn");
  });

  it("sin referrer es directo", () => {
    expect(bucketSource("")).toBe("directo");
    expect(bucketSource(null)).toBe("directo");
    expect(bucketSource(undefined)).toBe("directo");
  });

  it("una navegación interna es directo, no un canal", () => {
    // Contar el índice del blog como fuente de tráfico sería contarnos a nosotros.
    expect(bucketSource("https://www.easybits.cloud/blog/", "www.easybits.cloud")).toBe("directo");
    expect(bucketSource("https://easybits.cloud/blog/", "www.easybits.cloud")).toBe("directo");
  });

  it("un referrer que no es URL no revienta", () => {
    expect(bucketSource("android-app://com.slack")).toBe("otro");
    expect(bucketSource("basura")).toBe("otro");
  });
});

describe("isBot — sin esto, el post más leído sería el más crawleado", () => {
  it("descarta rastreadores y herramientas", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 ... HeadlessChrome/120.0.0.0",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("sin user-agent no hay persona", () => {
    expect(isBot("")).toBe(true);
    expect(isBot(null)).toBe(true);
  });

  it("deja pasar navegadores reales", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    ]) {
      expect(isBot(ua), ua).toBe(false);
    }
  });
});

describe("median", () => {
  it("impar toma el de en medio", () => expect(median([10, 30, 20])).toBe(20));
  it("par promedia los dos centrales", () => expect(median([10, 20, 30, 40])).toBe(25));
  it("vacío no inventa un cero", () => expect(median([])).toBe(null));
});

describe("isValidViewId", () => {
  it("acepta un uuid", () =>
    expect(isValidViewId("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true));
  it("rechaza texto libre", () => {
    expect(isValidViewId("../../etc/passwd")).toBe(false);
    expect(isValidViewId("")).toBe(false);
    expect(isValidViewId(42)).toBe(false);
  });
});

describe("aggregate", () => {
  const posts = [
    { slug: "a", title: "Post A", date: "2026-09-01", readingTime: 5 },
    { slug: "b", title: "Post B", date: "2026-08-30", readingTime: 8 },
  ];

  it("cuenta vistas y ordena por las más leídas", () => {
    const out = aggregate(
      [
        { slug: "b", source: "directo", seconds: null, completed: null },
        { slug: "a", source: "google", seconds: 100, completed: true },
        { slug: "a", source: "x", seconds: 20, completed: false },
      ],
      posts
    );
    expect(out.map((s) => s.slug)).toEqual(["a", "b"]);
    expect(out[0].views).toBe(2);
    expect(out[0].title).toBe("Post A");
  });

  it("una lectura SIN beacon es dato ausente, no un abandono", () => {
    // Con dos cierres (uno completo) y una lectura sin cerrar, el porcentaje es
    // 50%, no 33%: contar la ausente como fracaso nos haría reescribir un post que
    // en realidad funciona.
    const out = aggregate(
      [
        { slug: "a", source: "google", seconds: 100, completed: true },
        { slug: "a", source: "google", seconds: 10, completed: false },
        { slug: "a", source: "google", seconds: null, completed: null },
      ],
      posts
    );
    expect(out[0].views).toBe(3);
    expect(out[0].measured).toBe(2);
    expect(out[0].completedPct).toBe(50);
  });

  it("sin ninguna medición devuelve null, no 0", () => {
    // Un 0% se lee como "nadie lo terminó"; null se lee como "aún no sé".
    const out = aggregate(
      [{ slug: "a", source: "directo", seconds: null, completed: null }],
      posts
    );
    expect(out[0].completedPct).toBe(null);
    expect(out[0].medianSeconds).toBe(null);
  });

  it("lleva el estimado al lado para poder comparar", () => {
    const out = aggregate(
      [{ slug: "a", source: "google", seconds: 300, completed: true }],
      posts
    );
    expect(out[0].readingTimeMin).toBe(5);
    expect(out[0].medianSeconds).toBe(300);
  });

  it("agrupa las fuentes principales", () => {
    const out = aggregate(
      [
        { slug: "a", source: "google", seconds: null, completed: null },
        { slug: "a", source: "google", seconds: null, completed: null },
        { slug: "a", source: "x", seconds: null, completed: null },
      ],
      posts
    );
    expect(out[0].topSources).toEqual([
      { source: "google", views: 2 },
      { source: "x", views: 1 },
    ]);
  });

  it("un slug sin post (borrado o renombrado) no rompe la tabla", () => {
    const out = aggregate(
      [{ slug: "fantasma", source: "directo", seconds: null, completed: null }],
      posts
    );
    expect(out[0].title).toBe("fantasma");
    expect(out[0].readingTimeMin).toBe(0);
  });
});

// ─────────────── Cliente ───────────────
// El navegador automatizado tiene la pestaña siempre "hidden", así que la rama que
// suma tiempo no se ejercita end-to-end. Se prueba aquí.
const { accumulateSeconds, worthReporting } = await import(
  "~/routes/blog/useReadTracking"
);

describe("accumulateSeconds — solo cuenta con la pestaña al frente", () => {
  it("suma cuando es visible", () => {
    expect(accumulateSeconds(0, 1000, true)).toBe(1);
    expect(accumulateSeconds(10, 2500, true)).toBe(12.5);
  });

  it("no suma cuando está oculta", () => {
    // Una pestaña olvidada toda la tarde no es una lectura de tres horas.
    expect(accumulateSeconds(10, 3_600_000, false)).toBe(10);
  });

  it("un delta negativo (reloj del sistema movido) no resta", () => {
    expect(accumulateSeconds(10, -5000, true)).toBe(10);
  });
});

describe("worthReporting — qué cierres merecen guardarse", () => {
  it("un remonte instantáneo no se reporta", () => {
    // Si se reportara, la fila quedaría en ceros y hundiría la mediana.
    expect(worthReporting(0, 0, false)).toBe(false);
    expect(worthReporting(0.4, 0, false)).toBe(false);
  });

  it("un segundo de lectura ya cuenta", () => expect(worthReporting(1, 0, false)).toBe(true));
  it("con scroll cuenta aunque sea rápido", () =>
    expect(worthReporting(0.2, 30, false)).toBe(true));
  it("si llegó al final, cuenta siempre", () =>
    expect(worthReporting(0, 0, true)).toBe(true));
});
