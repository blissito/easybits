import { IoIosClose } from "react-icons/io";
import { cn } from "~/utils/cn";

export const BrutalButtonClose = ({
  className,
  ...props
}: {
  className?: string;
  [x: string]: unknown;
}) => {
  return (
    <button
      type="button"
      className={cn(
        "text-3xl hover bg-black rounded-full group w-max",
        className
      )}
      {...props}
    >
      <span className="block group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white rounded-full border border-black transition-all active:group-hover:translate-x-0 active:group-hover:translate-y-0">
        <IoIosClose />
      </span>
    </button>
  );
};
