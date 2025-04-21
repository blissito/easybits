import { cn } from "~/utils/cn";

const DEFAULT_PIC = "/logo-white.svg";
export const Avatar = ({
  className,
  src,
  size,
}: {
  size?: "xl";
  className?: string;
  src?: string;
}) => {
  return (
    <div
      className={cn(
        "w-10 h-10 border border-black bg-black  rounded-full grid place-content-center",
        className,
        {
          "w-20 h-20 p-4": size === "xl",
        }
      )}
    >
      <img
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = DEFAULT_PIC;
        }}
        className={cn("w-full h-full object-contain", {
          "w-40 h-40": size === "xl",
        })}
        src={src ? src : DEFAULT_PIC}
      />
    </div>
  );
};
