import { cn } from "~/utils/cn";

const DEFAULT_PIC = "/images/avatar_default.svg";
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
        " rounded-full",
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
        className={cn(
          "w-full h-full rounded-full object-cover border-black border-b-2 border-r-2"
        )}
      />
    </div>
  );
};
