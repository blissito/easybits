import { cn } from "~/utils/cn";

export const Tag = ({
  label,
  className,
  variant,
}: {
  label?: string;
  className?: string;
  variant?: string;
}) => {
  return (
    <div
      className={cn(
        "min-w-max",
        "capitalize",
        "h-8 rounded-full px-3 text-sm flex items-center text-white bg-black",
        {
          "bg-white text-black border-2 border-black":
            variant === "outline-solid",
        },
        {
          "bg-transparent border border-marengo text-marengo":
            variant === "dark",
        },
        className
      )}
    >
      {label}
    </div>
  );
};
