import { useMemo, useState } from "react";
import { Link } from "react-router";
import { cn } from "~/utils/cn";
import type { BlogPost } from "~/types/blog";

interface BlogContentProps {
  /** Todos los posts publicados (sin cuerpo). El filtrado es en cliente: la
   *  ruta está prerenderizada y un snapshot estático no ve la query. */
  posts: BlogPost[];
  tags: string[];
  featured?: BlogPost | null;
}

// Barra de tags curada: pocos tags relevantes en vez de los 15+ del blog.
// Solo se muestran los que existan en los posts publicados.
const KIND_CHIPS = [
  { kind: "lanzamiento", label: "Lanzamientos" },
  { kind: "tutorial", label: "Tutoriales" },
  { kind: "build-in-public", label: "Build in public" },
];
const CURATED_TAGS = [
  { tag: "ejemplos", label: "Ejemplos" },
  { tag: "sandboxes", label: "Sandboxes" },
  { tag: "SDK", label: "SDK" },
  { tag: "MCP", label: "MCP" },
  { tag: "agentes", label: "Agentes" },
];

export const BlogContent = ({ posts, tags, featured = null }: BlogContentProps) => {
  const [currentTag, setCurrentTag] = useState<string | null>(null);
  const [currentKind, setCurrentKind] = useState<string | null>(null);
  const [currentSearch, setCurrentSearch] = useState("");
  const isFront = !currentTag && !currentKind && !currentSearch;

  const visible = useMemo(() => {
    let list = posts;
    if (currentKind) list = list.filter((p) => p.kind === currentKind);
    if (currentTag) list = list.filter((p) => p.tags.some((t) => t.toLowerCase() === currentTag.toLowerCase()));
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (isFront && featured) list = list.filter((p) => p.slug !== featured.slug);
    return list;
  }, [posts, currentKind, currentTag, currentSearch, isFront, featured]);

  const kindLabel = currentKind ? KIND_CHIPS.find((k) => k.kind === currentKind)?.label ?? null : null;

  const handleTagClick = (tag: string) => {
    setCurrentKind(null);
    setCurrentTag(tag === "Todos" ? null : tag);
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const search = (new FormData(e.currentTarget).get("search") as string) ?? "";
    setCurrentSearch(search.trim());
  };

  return (
    <section className="">
      <div className="border-x-[2px] border-black  h-12 max-w-7xl mx-4 md:mx-[5%] xl:mx-auto "></div>
      <div className="border-y-[2px] border-black w-full h-fit lg:h-[72px] px-4 md:px-[5%] xl:px-0 ">
        <div className="border-x-[2px]  border-black w-full  h-full max-w-7xl flex-wrap lg:flex-nowrap  mx-auto flex justify-between gap-0 lg:gap-4 items-center pl-0 lg:pl-4">
          <div className="flex h-12 md:h-full items-center w-full lg:w-fit overflow-x-scroll md:overflow-hidden border-b-[2px] border-black lg:border-none">
            <Chip
              category="Todos"
              active={!currentTag && !currentKind}
              onClick={() => handleTagClick("Todos")}
            />
            {KIND_CHIPS.map((k) => (
              <Chip
                key={k.kind}
                category={k.label}
                active={currentKind === k.kind}
                onClick={() => {
                  setCurrentTag(null);
                  setCurrentKind(k.kind);
                }}
              />
            ))}
            {CURATED_TAGS.filter((t) => tags.includes(t.tag)).map((t) => (
              <Chip
                key={t.tag}
                category={t.label}
                active={currentTag === t.tag}
                onClick={() => handleTagClick(t.tag)}
              />
            ))}
          </div>
          <form
            onSubmit={handleSearchSubmit}
            className="bg-white w-full lg:w-96 h-12 lg:h-full flex"
          >
            <input
              name="search"
              defaultValue={currentSearch}
              className="w-full h-full border-[0px]  md:border-l-black  md:border-l-[2px] border-r-[0px] border-y-none px-3"
              placeholder="¿Qué quieres saber hoy?"
            />
            <button
              type="submit"
              className="w-12 lg:w-[72px] border-none h-full bg-black grid place-content-center"
            >
              <img alt="lupa" src="/blog/search.svg" />
            </button>
          </form>
        </div>
      </div>
      {/* Bloque Ejemplos: promo cuando no se filtra, header + volver cuando sí */}
      <div className="w-full px-4 md:px-[5%] xl:px-0">
        <div className="max-w-7xl mx-auto border-x-[2px] border-black px-4 md:px-6 pt-8">
          {currentTag === "ejemplos" ? (
            <div className="flex flex-wrap md:flex-nowrap items-center gap-4 justify-between">
              <div className="flex items-center gap-4">
                <span className="text-3xl md:text-4xl">📓</span>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold">Ejemplos</h2>
                  <p className="text-iron">
                    Recetas cortas y prácticas para empezar a usar el SDK paso a paso.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTagClick("Todos")}
                className="min-w-max rounded-full border-[2px] border-black px-4 h-10 grid place-content-center font-bold hover:bg-black hover:text-white transition-colors"
              >
                ← Ver todos los posts
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleTagClick("ejemplos")}
              className="w-full text-left group flex flex-wrap md:flex-nowrap items-center gap-4 justify-between rounded-2xl border-[2px] border-black p-5 md:p-6 bg-grayLight transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl md:text-4xl">📓</span>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold">Ejemplos</h3>
                  <p className="text-iron">
                    Recetas cortas para usar el SDK de Easybits — copia, pega y corre.
                  </p>
                </div>
              </div>
              <span className="min-w-max rounded-full border-[2px] border-black px-4 h-10 grid place-content-center font-bold group-hover:bg-black group-hover:text-white transition-colors">
                Ver ejemplos →
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="border-x-[2px] border-black min-h-screen max-w-7xl pt-8 lg:pt-12 mx-4 md:mx-[5%] xl:mx-auto px-4 md:px-6">
        {isFront && featured && <FeaturedCard post={featured} />}
        {!isFront && (
          <div className="mb-5">
            <h2 className="text-2xl md:text-3xl font-bold">
              {kindLabel ?? (currentTag ? currentTag : currentSearch ? `Resultados para "${currentSearch}"` : "Todos los posts")}
            </h2>
          </div>
        )}
        {visible.length > 0 ? (
          <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-12", isFront && featured ? "mt-5" : "")}>
            {visible.map((post) => <GridCard key={post.slug} post={post} />)}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-xl text-iron">
              No se encontraron entradas de blog.
            </p>
          </div>
        )}
      </div>
      <div className=" w-full h-12 lg:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="border-x-[2px] border-black   h-full max-w-7xl mx-auto flex justify-between gap-4 items-center pl-4"></div>
      </div>
    </section>
  );
};

const formatMonth = (dateString: string) =>
  new Date(dateString).toLocaleDateString("es-ES", { year: "numeric", month: "long" });

const KIND_LABEL: Record<string, string> = {
  lanzamiento: "Lanzamiento",
  tutorial: "Tutorial",
  "build-in-public": "Build in public",
};

/** Destacado de portada: horizontal desde md, misma altura que una fila de tarjetas. */
export const FeaturedCard = ({ post }: { post: BlogPost }) => (
  <Link
    to={`/blog/${post.slug}`}
    className="group grid grid-cols-1 md:grid-cols-5 rounded-2xl border-[2px] border-black overflow-hidden bg-white transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
  >
    <div className="md:col-span-2 bg-gray-100 border-b-[2px] md:border-b-0 md:border-r-[2px] border-black">
      {post.featuredImage ? (
        <img src={post.featuredImage} alt={post.title} className="w-full h-52 md:h-full md:max-h-[300px] object-cover" />
      ) : (
        <div className="w-full h-52 md:h-full grid place-content-center text-gray-500 text-sm">Sin imagen</div>
      )}
    </div>
    <div className="md:col-span-3 p-5 md:p-7 flex flex-col justify-center">
      <div className="flex items-center gap-2 text-xs text-brand-gray">
        <span className="rounded-full border-[2px] border-black px-2 py-0.5 font-bold text-black">Lo último</span>
        {post.kind && <span className="font-bold text-black">{KIND_LABEL[post.kind]}</span>}
        <span>·</span>
        <span>{formatMonth(post.date)}</span>
      </div>
      <h2 className="text-2xl md:text-3xl font-bold mt-3 leading-tight group-hover:underline">{post.title}</h2>
      <p className="text-iron mt-2 line-clamp-3">{post.description}</p>
      <div className="text-xs text-brand-gray mt-3">{post.author} · {post.readingTime} min de lectura</div>
    </div>
  </Link>
);

/** Tarjeta vertical para grillas de 2 o 3 columnas. */
export const GridCard = ({ post }: { post: BlogPost }) => (
  <Link
    to={`/blog/${post.slug}`}
    className="group flex flex-col rounded-2xl border-[2px] border-black overflow-hidden bg-white transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
  >
    {post.featuredImage ? (
      <img src={post.featuredImage} alt={post.title} className="aspect-video w-full object-cover border-b-[2px] border-black" />
    ) : (
      <div className="aspect-video w-full bg-gray-100 border-b-[2px] border-black grid place-content-center text-gray-500 text-sm">Sin imagen</div>
    )}
    <div className="p-4 md:p-5 flex flex-col gap-2 flex-1">
      <div className="flex items-center gap-2 text-xs text-brand-gray">
        {post.kind && <span className="font-bold text-black">{KIND_LABEL[post.kind]}</span>}
        {post.kind && <span>·</span>}
        <span>{formatMonth(post.date)}</span>
      </div>
      <h3 className="text-lg font-bold leading-snug group-hover:underline">{post.title}</h3>
      <p className="text-iron text-sm line-clamp-3">{post.description || post.excerpt}</p>
      <div className="mt-auto pt-2 text-xs text-brand-gray">{post.readingTime} min de lectura</div>
    </div>
  </Link>
);

export const BlogCard = ({
  post,
  className,
}: {
  post: BlogPost;
  className?: string;
}) => {
  // Format date to Spanish
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
    });
  };

  return (
    <Link to={`/blog/${post.slug}`}>
      <section
        className={cn(
          "border-t-[2px] border-black p-4 md:p-6 flex-wrap md:flex-nowrap hover:bg-grayLight flex gap-8 group transition-all cursor-pointer",
          className
        )}
      >
        {post.featuredImage ? (
          <img
            src={post.featuredImage}
            alt={post.title}
            className="aspect-video w-full md:w-[240px] h-48 md:h-auto object-cover rounded-xl"
          />
        ) : (
          <div className="w-full md:w-[240px] h-48 md:h-auto bg-gray-200 rounded-xl flex items-center justify-center">
            <span className="text-gray-500">Sin imagen</span>
          </div>
        )}
        <div className="">
          <span className="text-brand-gray text-sm">
            {formatDate(post.date)}
          </span>
          <h3 className="text-xl font-bold mb-1 group-hover:underline ">
            {post.title}
          </h3>
          <p className="text-iron">{post.excerpt}</p>
          <div className="flex text-sm md:text-base mt-2 gap-2 items-center text-brand-gray">
            <div className="w-8 h-8 rounded-full border-[2px] border-black bg-gray-200 flex items-center justify-center">
              <span className="text-xs font-bold">
                {post.author.charAt(0).toUpperCase()}
              </span>
            </div>
            <p>{post.author}</p>
            <hr className="bg-brand-gray/50 w-[1px] h-3" />
            <p>{post.readingTime} min de lectura</p>
            {post.tags.length > 0 && (
              <>
                <hr className="bg-brand-gray/50 w-[1px] h-3" />
                <p>{post.tags[0]}</p>
              </>
            )}
          </div>
        </div>
      </section>
    </Link>
  );
};

export const Chip = ({
  category,
  active = false,
  onClick,
}: {
  category: string;
  active?: boolean;
  onClick?: () => void;
}) => {
  return (
    <div
      className={cn(
        "min-w-max h-10 rounded-full border-[2px] grid place-content-center px-3 cursor-pointer hover:border-black/50 transition-colors",
        active ? "border-black" : "border-transparent"
      )}
      onClick={onClick}
    >
      {category}
    </div>
  );
};
export const BlogHeader = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-0  lg:mb-20 text-center relative">
      <img
        className="absolute left-96 md:left-20 lg:left-80 top-28 md:top-32 w-8 md:w-auto"
        alt="star"
        src="/home/star.svg"
      />
      <img
        className="absolute  right-96 md:right-24 top-16 md:top-40 lg:right-80 w-12 md:w-16"
        alt="waves"
        src="/home/waves.svg"
      />
      <img
        className="absolute hidden md:block w-8 left-[480px] top-80 lg:top-96 xl:top-80"
        alt="asterisk"
        src="/home/asterisk.svg"
      />
      <div className="max-w-5xl mx-auto  px-4 md:px-[5%] xl:px-0">
        <h2 className="text-4xl lg:text-6xl font-bold">Blog</h2>
        <p className="text-iron text-xl lg:text-2xl mt-4 md:mt-6">
          Echa un vistazo a todo lo que nuestro equipo de ingenieros y
          diseñadores quieren compartirte.
        </p>
      </div>
    </section>
  );
};
