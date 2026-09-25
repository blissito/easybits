import { Link } from "react-router";
import type { Route } from "./+types/en.docs";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import Markdown from "~/components/common/Markdown";
import { PageActions } from "~/components/docs/PageActions";
import { SkillsInstall } from "~/components/docs/SkillsInstall";
import { useEffect, useState } from "react";

// /en/docs — la referencia en inglés ("lo que vende"), renderizada desde el markdown de
// reference.en.ts. A diferencia de /docs (un TSX de 4k líneas), aquí la página ES el
// markdown: lo que lee un agente en /en/docs/<s>.md es exactamente lo que ve el humano.
const TITLES: Record<string, string> = {
  about: "About EasyBits",
  quickstart: "Quickstart",
  cli: "CLI",
  web: "Web",
  agents: "Agents & Sandboxes",
  hosting: "Hosting",
  databases: "Databases",
  files: "Files",
  errors: "Errors",
  "tool-groups": "Tool groups",
};

export const loader = async () => {
  const { getDocsMarkdown, EN_SECTION_KEYS, VALID_SECTIONS } = await import("~/.server/docs/reference");
  const sections = await Promise.all(
    EN_SECTION_KEYS.map(async (id) => ({ id, title: TITLES[id] ?? id, markdown: await getDocsMarkdown(id, "en") }))
  );
  const en = new Set<string>(EN_SECTION_KEYS);
  const spanishOnly = VALID_SECTIONS.filter((s) => !en.has(s));
  return { sections, spanishOnly };
};

export const meta = () => [
  ...getBasicMetaTags({
    title: "EasyBits API Docs — The cloud for AI agents",
    description: "EasyBits reference in English: sandboxes, web, files, SQL databases, hosting and errors for the REST API v2, SDK and MCP.",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/en/docs" },
  { tagName: "link", rel: "alternate", hreflang: "en", href: "https://www.easybits.cloud/en/docs" },
  { tagName: "link", rel: "alternate", hreflang: "es", href: "https://www.easybits.cloud/docs" },
  { tagName: "link", rel: "alternate", type: "text/markdown", href: "https://www.easybits.cloud/en/docs.md" },
];

export const headers: Route.HeadersFunction = () => ({
  Vary: "Accept",
  Link: '<https://www.easybits.cloud/en/docs.md>; rel="alternate"; type="text/markdown"',
});

export default function EnDocsPage({ loaderData }: Route.ComponentProps) {
  const { sections, spanishOnly } = loaderData;
  const [active, setActive] = useState<string>(sections[0]?.id ?? "about");

  // Sección activa por scroll (misma idea que /docs, sin hash en el estado inicial).
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <section className="min-h-screen bg-white">
      <nav className="border-b-2 border-black px-6 py-4 sticky top-0 bg-white z-50 flex items-center justify-between">
        <Link to="/" className="font-bold hover:underline">EasyBits</Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/docs" className="underline">Español</Link>
          <Link to="/docs/api" className="underline">OpenAPI</Link>
          <a href="/en/llms.txt" className="font-mono underline">llms.txt</a>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto flex">
        <aside className="hidden md:block w-56 shrink-0 border-r-2 border-black sticky top-[57px] self-start p-4 max-h-[calc(100vh-57px)] overflow-y-auto">
          <h2 className="font-bold text-xs uppercase text-gray-500 mb-3">API Reference</h2>
          <nav className="space-y-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                aria-current={active === s.id ? "true" : undefined}
                className={`block px-3 py-1.5 rounded-lg text-sm ${active === s.id ? "bg-black text-white font-bold" : "hover:bg-gray-100"}`}
              >
                {s.title}
              </a>
            ))}
          </nav>
          <h2 className="font-bold text-xs uppercase text-gray-500 mt-6 mb-2">Spanish only</h2>
          <nav className="space-y-0.5">
            {spanishOnly.map((s) => (
              <a key={s} href={`/docs/${s}.md`} className="block px-3 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 font-mono">
                {s}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 px-6 md:px-12 py-10 max-w-4xl [&_section[id]]:scroll-mt-20">
          <h1 className="text-3xl font-bold mb-2">API documentation</h1>
          <p className="text-gray-500 mb-6 text-sm">
            Sandboxes, web, files, databases, documents and hosting for AI agents. Base URL:{" "}
            <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">https://www.easybits.cloud/api/v2</code>
          </p>
          <div className="mb-6">
            <SkillsInstall locale="en" />
          </div>
          <div className="mb-8">
            <PageActions section={active} locale="en" />
          </div>
          {sections.map((s) => (
            <section id={s.id} key={s.id} className="mb-16 border-t-2 border-black pt-8">
              <Markdown>{s.markdown}</Markdown>
            </section>
          ))}
          <p className="text-xs text-gray-500 border-t-2 border-black pt-6">
            The remaining sections are in Spanish for now: <Link to="/docs" className="underline">/docs</Link>. Every section is also
            available as markdown at <span className="font-mono">/en/docs/&lt;section&gt;.md</span> and answers{" "}
            <span className="font-mono">Accept: text/markdown</span>.
          </p>
        </main>
      </div>
    </section>
  );
}
