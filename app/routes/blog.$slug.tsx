import { Link } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { PostHeader } from "./blog/PostHeader";
import { PostContent } from "./blog/PostContent";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { Footer } from "~/components/common/Footer";
import { useReadTracking, READ_SENTINEL_ID } from "./blog/useReadTracking";
import type { Route } from "./+types/blog.$slug";
import path from "path";
import {
  getPostBySlug,
  getPostLangs,
  listPublishedPosts,
  SLUG_REDIRECTS,
  type PostLang,
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

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const slug = params.slug;

  // El idioma viaja en `?lang=`, no en la ruta: la traducción es OTRA VISTA del
  // mismo post, no otro post. Así el slug, los links ya compartidos y el
  // canonical siguen siendo uno solo.
  const requested = new URL(request.url).searchParams.get("lang");
  const wanted: PostLang = requested === "en" ? "en" : "es";

  const movedTo = slug ? SLUG_REDIRECTS[slug] : undefined;
  if (movedTo) {
    // 301: el buscador traslada el ranking en vez de indexar dos URLs iguales.
    throw new Response(null, { status: 301, headers: { Location: `/blog/${movedTo}` } });
  }

  try {
    const langs = slug ? await getPostLangs(slug) : [];
    // Pedir un idioma que no existe cae al español en vez de dar 404: un link a
    // `?lang=en` de un post sin traducir tiene que seguir abriendo el post.
    const lang: PostLang = langs.includes(wanted) ? wanted : "es";
    const post = slug ? await getPostBySlug(slug, lang) : null;
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
      langs,
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
  const langs: string[] = (data as any).langs ?? ["es"];
  // hreflang: le dice al buscador que las dos URLs son el MISMO texto en otro
  // idioma. Sin esto compiten entre sí en vez de sumar.
  const alternates = langs.length > 1
    ? [
        { tagName: "link", rel: "alternate", hreflang: "es", href: canonical },
        {
          tagName: "link",
          rel: "alternate",
          hreflang: "en",
          href: `${canonical}?lang=en`,
        },
        { tagName: "link", rel: "alternate", hreflang: "x-default", href: canonical },
      ]
    : [];

  return [
    ...alternates,
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
    { property: "og:locale", content: post.lang === "en" ? "en_US" : "es_MX" },
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

/**
 * Alterna entre el post y su traducción. Sólo se pinta si el post TIENE
 * traducción — un botón que lleva al mismo texto es peor que no tenerlo.
 */
function TranslateToggle({ slug, lang }: { slug: string; lang: string }) {
  const toEnglish = lang !== "en";
  return (
    <div className="flex justify-end mb-4">
      <Link
        to={toEnglish ? `/blog/${slug}?lang=en` : `/blog/${slug}`}
        prefetch="intent"
        hrefLang={toEnglish ? "en" : "es"}
        className="inline-flex items-center gap-2 border-[2px] border-black rounded-full px-4 py-1.5 text-sm font-semibold bg-white hover:bg-black hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9870ED]"
      >
        {toEnglish ? "Read in English" : "Leer en español"}
      </Link>
    </div>
  );
}

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const serverData = loaderData as any; // Type assertion for now

  // Handle the case where we have both server and client data
  const post = serverData.post || null;
  const user = serverData.user || null;
  const relatedPosts = serverData.relatedPosts || [];
  const langs: string[] = serverData.langs || ["es"];

  // Antes del early return de abajo: un hook no puede llamarse condicionalmente.
  // Con slug vacío no hace nada.
  useReadTracking(post?.slug ?? "", post?.lang);

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
        {langs.length > 1 && <TranslateToggle slug={post.slug} lang={post.lang} />}
        <PostHeader post={post} />
        <PostContent post={post} />
        {/* Fin del artículo. Marca "llegó al final" mejor que un % de scroll:
            el pie y los relacionados ocupan pantalla y falsean el porcentaje. */}
        <div id={READ_SENTINEL_ID} aria-hidden="true" className="h-px" />
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
            inLanguage: post.lang ?? "es",
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
