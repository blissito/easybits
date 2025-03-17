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
        "h-8 rounded-full w-fit px-3 text-sm flex items-center text-white bg-black",
        {
          "bg-white text-black border-[2px] border-black":
            variant === "outline",
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
