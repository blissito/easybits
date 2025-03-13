import { Tag } from "~/components/common/Tag";
import { cn } from "~/utils/cn";

export const Card = ({
  className,
  img,
  title,
  description,
  tags = [],
}: {
  className?: string;
  img?: string;
  title?: string;
  description?: string;
  tags?: string[];
}) => {
  return (
    <div className="relative group inline-block col-span-1">
      {/* Shadow button */}
      <div className="absolute w-full lg:w-96 inset-0 h-64 bg-black rounded-xl transition-all duration-300 scale-100 group-hover:translate-x-2 group-hover:translate-y-2 opacity-0 group-hover:opacity-100" />
      <div
        className={cn(
          "rounded-xl  bg-white  h-64 z-0  p-4 text-black text-lg w-full lg:w-96 border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1",
          className
        )}
      >
        <img
          className="mb-1 w-16"
          alt="book"
          src={img ? img : "/default.svg"}
        />
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-iron text-base mb-4 min-h-[72px]">{description}</p>
        <div className="flex gap-2">
          {tags.map((tag, index) => (
            <Tag variant="outline" key={index} label={tag} />
          ))}
        </div>
      </div>
    </div>
  );
};
