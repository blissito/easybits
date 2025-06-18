import { cn } from "~/utils/cn";

export const UsersList = () => {
  return (
    <div
      className={cn(
        "hidden flex-col items-center justify-start min-w-10 gap-2 pt-2 ",
        "md:flex md:w-20"
      )}
    >
      <img className="w-10" src="/logo-purple.svg" alt="television" />
      <Avatar />
      <Avatar />
      <Avatar />
      <Avatar />
    </div>
  );
};

export const Avatar = ({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) => {
  return (
    <div
      className={cn(
        "w-6 h-6 md:w-10 md:h-10 rounded-full text-xs md:text-base border border-black bg-[#7A7B7C] text-gray-700 grid place-content-center cursor-pointer",
        className
      )}
    >
      <span>ML</span>
    </div>
  );
};
