import { FaArrowLeft } from "react-icons/fa";
import { Link } from "react-router";
import type { BlogPost } from "~/types/blog";

interface PostHeaderProps {
  post: BlogPost;
}

export const PostHeader = ({ post }: PostHeaderProps) => {
  // Format date to Spanish with relative time
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const formattedDate = date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
    });

    let relativeTime = "";
    if (diffDays === 1) {
      relativeTime = "(hace 1 día)";
    } else if (diffDays < 30) {
      relativeTime = `(hace ${diffDays} días)`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      relativeTime = months === 1 ? "(hace 1 mes)" : `(hace ${months} meses)`;
    }

    return `${formattedDate} ${relativeTime}`;
  };

  return (
    <section className="max-w-3xl relative mx-auto border-b-[1px] border-b-black md:pb-10 pb-8 mb-8 md:mb-10">
      <Link
        to="/blog"
        className="absolute -left-16 top-10 text-xl border-2 border-transparent hover:border-black w-12 h-12 rounded-lg grid place-content-center transition-colors"
      >
        <FaArrowLeft />
      </Link>
      <span className="text-brand-gray text-sm">{formatDate(post.date)}</span>

      <h1 className="text-3xl md:text-5xl font-bold mb-1 !leading-snug">
        {post.title}
      </h1>
      <div className="flex text-sm md:text-lg mt-2 gap-2 items-center text-iron">
        <div className="w-8 h-8 md:w-14 md:h-14 rounded-full border-[1px] border-black bg-gray-200 flex items-center justify-center">
          <span className="text-xs md:text-sm font-bold">
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
    </section>
  );
};
