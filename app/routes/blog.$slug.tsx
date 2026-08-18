import { AuthNav } from "~/components/login/auth-nav";
import { PostHeader } from "./blog/PostHeader";
import { PostContent } from "./blog/PostContent";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { Footer } from "~/components/common/Footer";
import type { Route } from "./+types/blog.$slug";
import path from "path";
import {
  getPostBySlug,
  listPublishedPosts,
  SLUG_REDIRECTS,
} from "~/.server/blogPosts";
// import readingTime from "reading-time"; // REMOVE this import

// Map of known blog posts with their file paths
// Helper to ensure absolute image URLs
const getAbsoluteImageUrl = (img: string | null | undefined) =>
  img?.startsWith("http")
    ? img
    : img
    ? `https://www.easybits.cloud${img}`
    : undefined;

/**
 * Dimensiones y tipo REALES de la imagen destacada.
 *
 * WhatsApp y Facebook usan `og:image:width/height/type` para reservar el
 * recuadro ANTES de descargar la imagen, así que un valor inventado sale caro:
 * o recortan mal, o descartan la miniatura y mandan sólo el link pelado.
 * Estaban fijos en "1024x1024 image/jpeg" con un comentario que decía que todas
 * las destacadas eran así — y no lo eran: la portada de este post mide 940x627 y
 * la del post de TCP es un PNG de 1200x630.
 *
 * Se mide con sharp sobre el archivo de `public/` y se memoiza: son un puñado de
 * archivos que no cambian en caliente. Si no se puede medir (imagen remota, por
 * ejemplo), se devuelve null y las etiquetas se OMITEN — mejor callar que mentir.
 */
const imageMetaCache = new Map<string, { width: number; height: number; type: string } | null>();

async function measureFeaturedImage(
  img: string | null | undefined
): Promise<{ width: number; height: number; type: string } | null> {
  if (!img || img.startsWith("http")) return null; // remota: no la descargamos por una etiqueta
  if (imageMetaCache.has(img)) return imageMetaCache.get(img) ?? null;
  let meta: { width: number; height: number; type: string } | null = null;
  // En dev los estáticos están en `public/`; en el contenedor ya están copiados a
  // `build/client/`. Probar sólo uno hace que la medición falle EN PRODUCCIÓN y,
  // como el fallo es silencioso por diseño, las etiquetas desaparecen sin ruido.
  for (const base of ["public", "build/client"]) {
    try {
      const sharp = (await import("sharp")).default;
      const m = await sharp(path.join(process.cwd(), base, img)).metadata();
      if (m.width && m.height && m.format) {
        meta = { width: m.width, height: m.height, type: `image/${m.format === "jpg" ? "jpeg" : m.format}` };
        break;
      }
    } catch {
      // sigue con la siguiente ruta; nunca romper el post por una miniatura
    }
  }
  imageMetaCache.set(img, meta);
  return meta;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const slug = params.slug;

  const movedTo = slug ? SLUG_REDIRECTS[slug] : undefined;
  if (movedTo) {
    // 301: el buscador traslada el ranking en vez de indexar dos URLs iguales.
    throw new Response(null, { status: 301, headers: { Location: `/blog/${movedTo}` } });
  }

  try {
    const post = slug ? await getPostBySlug(slug) : null;
    if (!post) throw new Response("Post not found", { status: 404 });

    // Relacionados por tags compartidos, con los más recientes como relleno.
    // Antes eran de mentira: título "Related Post: <slug>" y fecha 2025-01-01.
    const others = (await listPublishedPosts()).filter((p) => p.slug !== post.slug);
    const shared = (p: (typeof others)[number]) =>
      p.tags.filter((t) => post.tags.includes(t)).length;
    const relatedPosts = others
      .sort((a, b) => shared(b) - shared(a))
      .slice(0, 3);

    return {
      post: { ...post, imageMeta: await measureFeaturedImage(post.featuredImage) },
      relatedPosts,
    };
  } catch (error) {
    if (error instanceof Response) throw error; // 404/301 son respuestas, no fallos
    console.error("Error loading blog post:", error);
    throw new Response("Error loading post", { status: 500 });
  }
};

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.post) {
    return [
      { title: "Post no encontrado | EasyBits" },
      { name: "description", content: "El post que buscas no existe." },
    ];
  }

  const { post } = data;
  const fallbackImage = "https://www.easybits.cloud/logo-eb.svg";
  const imageUrl = getAbsoluteImageUrl(post.featuredImage) || fallbackImage;

  const canonical = `https://www.easybits.cloud/blog/${post.slug}`;

  return [
    { title: `${post.title} | EasyBits` },
    { name: "description", content: post.description },
    { name: "keywords", content: post.tags.join(", ") },
    { name: "author", content: post.author },
    { name: "robots", content: "index, follow, max-image-preview:large" },
    // Canonical (dedupe for search + AI crawlers)
    { tagName: "link", rel: "canonical", href: canonical },

    // Open Graph
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.description },
    { property: "og:type", content: "article" },
    { property: "og:site_name", content: "EasyBits" },
    { property: "og:locale", content: "es_MX" },
    { property: "og:url", content: canonical },
    { property: "og:image", content: imageUrl },
    { property: "og:image:alt", content: post.title },
    // WhatsApp/Facebook reservan el recuadro con estas medidas ANTES de bajar la
    // imagen: si no coinciden, recortan mal o descartan la miniatura. Se miden
    // del archivo real; si no se pudieron medir, se omiten (mejor callar).
    ...(post.imageMeta
      ? [
          { property: "og:image:width", content: String(post.imageMeta.width) },
          { property: "og:image:height", content: String(post.imageMeta.height) },
          { property: "og:image:type", content: post.imageMeta.type },
        ]
      : []),
    { property: "og:image:secure_url", content: imageUrl },
    { property: "article:author", content: post.author },
    {
      property: "article:published_time",
      content: new Date(post.date).toISOString(),
    },
    { property: "article:tag", content: post.tags.join(", ") },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: post.title },
    { name: "twitter:description", content: post.description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: post.title },
  ];
};

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const serverData = loaderData as any; // Type assertion for now

  // Handle the case where we have both server and client data
  const post = serverData.post || null;
  const user = serverData.user || null;
  const relatedPosts = serverData.relatedPosts || [];

  if (!post) {
    return (
      <section className="overflow-hidden">
        <AuthNav user={user} />
        <div className="pt-32 md:pt-[200px] pb-20 md:pb-32 max-w-7xl border-x-[2px] border-black mx-4 md:mx-[5%] xl:mx-auto px-4">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Post no encontrado</h1>
            <p className="text-iron">
              El post que buscas no existe o no se pudo cargar.
            </p>
          </div>
        </div>
        <Footer />
      </section>
    );
  }
  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <div className="pt-32 md:pt-[200px] pb-20 md:pb-32 max-w-7xl border-x-[2px] border-black mx-4 md:mx-[5%] xl:mx-auto px-4">
        <PostHeader post={post} />
        <PostContent post={post} />
        <SuscriptionBox />
      </div>
      <Footer />

      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            inLanguage: "es",
            headline: post.title,
            description: post.description,
            image: [
              getAbsoluteImageUrl(post.featuredImage) ||
                "https://www.easybits.cloud/logo-eb.svg",
            ],
            datePublished: new Date(post.date).toISOString(),
            dateModified: new Date(post.date).toISOString(),
            author: {
              "@type": "Person",
              name: post.author,
            },
            publisher: {
              "@type": "Organization",
              name: "EasyBits",
              logo: {
                "@type": "ImageObject",
                url: "https://www.easybits.cloud/logo-eb.svg",
              },
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `https://www.easybits.cloud/blog/${post.slug}`,
            },
            keywords: post.tags,
            wordCount: post.content
              .split(/\s+/)
              .filter((word: string) => word.length > 0).length,
            timeRequired: `PT${post.readingTime}M`,
          }),
        }}
      />
    </section>
  );
}
