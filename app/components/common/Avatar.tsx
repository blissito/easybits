import { cn } from "~/utils/cn";

const DEFAULT_PIC = "/logo-white.svg";
export const Avatar = ({
  className,
  src,
  size,
}: {
  size?: "xl";
  className?: string;
  src?: string | null;
}) => {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full",
        "w-10 h-10 border border-black bg-black ",
        className,
        {
          "w-20 h-20": size === "xl",
        }
      )}
    >
      <img
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = DEFAULT_PIC;
        }}
        src={src || DEFAULT_PIC}
        className={cn("w-full h-full object-cover")}
      />
    </div>
  );
};
