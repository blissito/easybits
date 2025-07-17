import {
  MdKeyboardDoubleArrowLeft,
  MdKeyboardDoubleArrowRight,
} from "react-icons/md";
import { Link, useSearchParams } from "react-router";
import { cn } from "~/utils/cn";
import type { BlogPost } from "~/types/blog";

interface BlogContentProps {
  posts: BlogPost[];
  tags: string[];
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const BlogContent = ({
  posts,
  tags,
  totalPages,
  currentPage,
  hasNextPage,
  hasPrevPage,
}: BlogContentProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTag = searchParams.get("tag");
  const currentSearch = searchParams.get("search") || "";

  const handleTagClick = (tag: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (tag === "Todos") {
      newParams.delete("tag");
    } else {
      newParams.set("tag", tag);
    }
    newParams.delete("page"); // Reset to first page when filtering
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get("search") as string;
    const newParams = new URLSearchParams(searchParams);
    if (search.trim()) {
      newParams.set("search", search.trim());
    } else {
      newParams.delete("search");
    }
    newParams.delete("page"); // Reset to first page when searching
    setSearchParams(newParams);
  };

  return (
    <section className="">
      <div className="border-x-2 border-black  h-12 max-w-7xl mx-4 md:mx-[5%] xl:mx-auto "></div>
      <div className="border-y-2 border-black w-full h-fit lg:h-[72px] px-4 md:px-[5%] xl:px-0 ">
        <div className="border-x-2  border-black w-full  h-full max-w-7xl flex-wrap lg:flex-nowrap  mx-auto flex justify-between gap-0 lg:gap-4 items-center pl-0 lg:pl-4">
          <div className="flex h-12 md:h-full items-center w-full lg:w-fit overflow-x-scroll md:overflow-hidden border-b-2 border-black lg:border-none">
            <Chip
              category="Todos"
              active={!currentTag}
              onClick={() => handleTagClick("Todos")}
            />
            {tags.map((tag) => (
              <Chip
                key={tag}
                category={tag}
                active={currentTag === tag}
                onClick={() => handleTagClick(tag)}
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
              className="w-full h-full border-0  md:border-l-black  md:border-l-2 border-r-0 border-y-none px-3"
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
      <div className="border-x-2 border-black  min-h-screen max-w-7xl pt-12 lg:pt-20  mx-4 md:mx-[5%] xl:mx-auto">
        {posts.length > 0 ? (
          posts.map((post) => <BlogCard key={post.slug} post={post} />)
        ) : (
          <div className="text-center py-20">
            <p className="text-xl text-iron">
              No se encontraron entradas de blog.
            </p>
          </div>
        )}
      </div>
      <Pagination
        totalPages={totalPages}
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
      />
      <div className=" w-full h-12 lg:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="border-x-2 border-black   h-full max-w-7xl mx-auto flex justify-between gap-4 items-center pl-4"></div>
      </div>
    </section>
  );
};

export const Pagination = ({
  totalPages,
  currentPage,
  hasNextPage,
  hasPrevPage,
}: {
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const handlePageChange = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", page.toString());
    setSearchParams(newParams);
  };

  const handlePrevPage = () => {
    if (hasPrevPage) {
      handlePageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      handlePageChange(currentPage + 1);
    }
  };

  if (totalPages <= 1) {
    return null; // Don't show pagination if there's only one page
  }

  return (
    <div className="border-y-2 border-black w-full h-10 px-4 md:px-[5%] xl:px-0">
      <div className="border-x-2 border-black  h-full max-w-7xl mx-auto flex justify-end  items-center pl-4">
        <div className="px-3 border-l-2 h-full grid place-content-center border-black">
          <p>
            {currentPage} de {totalPages}
          </p>
        </div>
        <button
          onClick={handlePrevPage}
          disabled={!hasPrevPage}
          className={cn(
            "w-10 text-2xl text-white h-full grid place-content-center transition-colors",
            hasPrevPage
              ? "hover:bg-black/80 cursor-pointer bg-black"
              : "bg-gray-400 cursor-not-allowed"
          )}
        >
          <MdKeyboardDoubleArrowLeft />
        </button>
        <button
          onClick={handleNextPage}
          disabled={!hasNextPage}
          className={cn(
            "w-10 text-2xl text-white h-full grid place-content-center border-l-2 border-white/20 transition-colors",
            hasNextPage
              ? "hover:bg-black/80 cursor-pointer bg-black"
              : "bg-gray-400 cursor-not-allowed"
          )}
        >
          <MdKeyboardDoubleArrowRight />
        </button>
      </div>
    </div>
  );
};

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
          "border-t-2 border-black p-4 md:p-6 flex-wrap md:flex-nowrap hover:bg-grayLight flex gap-8 group transition-all cursor-pointer",
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
            <div className="w-8 h-8 rounded-full border-2 border-black bg-gray-200 flex items-center justify-center">
              <span className="text-xs font-bold">
                {post.author.charAt(0).toUpperCase()}
              </span>
            </div>
            <p>{post.author}</p>
            <hr className="bg-brand-gray/50 w-px h-3" />
            <p>{post.readingTime} min de lectura</p>
            {post.tags.length > 0 && (
              <>
                <hr className="bg-brand-gray/50 w-px h-3" />
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
        "min-w-max h-10 rounded-full border-2 grid place-content-center px-3 cursor-pointer hover:border-black/50 transition-colors",
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
