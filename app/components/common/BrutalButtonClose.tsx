import { IoIosClose } from "react-icons/io";
import { cn } from "~/utils/cn";
import Spinner from "./Spinner";

export const BrutalButtonClose = ({
  className,
  isLoading,
  mode,
  ...props
}: {
  className?: string;
  isLoading?: boolean;
  mode?: "mini";
  [x: string]: unknown;
}) => {
  return (
    <button
      type="button"
      className={cn(
        "text-3xl hover bg-black rounded-full group w-max",
        className,
        {
          "text-xl": mode === "mini",
        }
      )}
      {...props}
    >
      <span className="block group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white rounded-full border border-black transition-all group-hover:active:translate-x-0 group-hover:active:translate-y-0">
    {
      isLoading ? <Spinner /> : <IoIosClose />
    }
      </span>
    </button>
  );
};
