/**
 * Índice del blog derivado del DIRECTORIO, no de listas a mano.
 *
 * Antes, publicar un post exigía tocar tres sitios: el `.mdx` y DOS registros
 * hardcodeados (`BLOG_POSTS` en blog.tsx, y `BLOG_POSTS` + `BLOG_POSTS_LIST` en
 * blog.$slug.tsx). Olvidar el segundo dejaba el post visible en la lista y en
 * 404 al abrirlo; olvidar ambos lo hacía invisible. No es hipotético: tres posts
 * publicados llevaban meses inalcanzables cuando esto se escribió.
 *
 * El slug sale del nombre del archivo sin el prefijo de fecha
 * (`2026-08-18-mi-post.mdx` → `mi-post`), que es exactamente la convención que
 * ya seguían los 25 registros previos — se verificó uno por uno antes de migrar.
 */
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = "app/content/blog";

export type PostLang = "es" | "en";

export interface BlogPost {
  slug: string;
  /** Idioma del archivo. `mi-post.en.mdx` es la traducción de `mi-post.mdx`. */
  lang: PostLang;
  filePath: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  featuredImage: string | null;
  published: boolean;
  /** Cuerpo del post en markdown. */
  content: string;
  readingTime: number;
  excerpt: string;
}

/**
 * Los archivos no cambian sin un deploy, así que se leen una vez por proceso.
 * En desarrollo NO se cachea: escribir un post y no verlo al recargar es una
 * forma tonta de perder media hora.
 */
let cache: Promise<BlogPost[]> | null = null;

function slugOf(fileName: string): string {
  return fileName
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/\.mdx$/, "")
    .replace(/\.en$/, "");
}

/**
 * El idioma va en el nombre del archivo, no en el frontmatter, para que la
 * traducción comparta slug con el original y el índice no se duplique:
 * `2026-08-18-mi-post.mdx` (es) y `2026-08-18-mi-post.en.mdx` (en) son el MISMO
 * post en `/blog/mi-post`, y el botón de traducir sólo cambia `?lang=`.
 */
function langOf(fileName: string): PostLang {
  return fileName.endsWith(".en.mdx") ? "en" : "es";
}

function excerptOf(content: string): string {
  return (
    content
      .replace(/^#.*$/gm, "") // los títulos no son resumen
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ni las imágenes
      .replace(/[#*`>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) + "..."
  );
}

async function readAll(): Promise<BlogPost[]> {
  const dir = path.join(process.cwd(), BLOG_DIR);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".mdx"));
  const readingTime = (await import("reading-time")).default;

  const posts = await Promise.all(
    files.map(async (fileName) => {
      const raw = await fs.readFile(path.join(dir, fileName), "utf-8");
      const { data, content } = matter(raw);
      return {
        slug: slugOf(fileName),
        lang: langOf(fileName),
        filePath: `${BLOG_DIR}/${fileName}`,
        title: data.title ?? slugOf(fileName),
        description: data.description ?? "",
        date: data.date ?? fileName.slice(0, 10),
        author: data.author ?? "Equipo Easybits",
        tags: data.tags ?? [],
        featuredImage: data.featuredImage ?? null,
        published: data.published !== false,
        content,
        readingTime: Math.ceil(readingTime(content).minutes),
        excerpt: excerptOf(content),
      } satisfies BlogPost;
    })
  );

  // Más reciente primero: el orden del `readdir` es del sistema de archivos y no
  // se puede confiar en él.
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function allPosts(): Promise<BlogPost[]> {
  if (process.env.NODE_ENV !== "production") return readAll();
  cache ??= readAll();
  return cache;
}

/**
 * Posts publicados, del más reciente al más viejo.
 *
 * SÓLO los originales en español: una traducción no es una entrada más del
 * índice, es otra vista del mismo post. Listarlas duplicaría cada post traducido
 * en la portada del blog y en el sitemap.
 */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  return (await allPosts()).filter((p) => p.published && p.lang === "es");
}

/** Un post por slug en un idioma, o null si no existe o es borrador. */
export async function getPostBySlug(
  slug: string,
  lang: PostLang = "es"
): Promise<BlogPost | null> {
  const post = (await allPosts()).find(
    (p) => p.slug === slug && p.lang === lang
  );
  return post?.published ? post : null;
}

/** Idiomas disponibles de un post. Vacío si el post no existe. */
export async function getPostLangs(slug: string): Promise<PostLang[]> {
  return (await allPosts())
    .filter((p) => p.slug === slug && p.published)
    .map((p) => p.lang);
}

/**
 * Slugs viejos que ya se compartieron → su URL actual. Un post renombrado no
 * puede devolver 404: el link ya vive en un chat de WhatsApp o en un tuit.
 */
export const SLUG_REDIRECTS: Record<string, string> = {
  "iptables-no-ve-tu-bridge": "tu-regla-de-firewall-no-bloquea-nada",
};
