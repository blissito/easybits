import clsx from "clsx";

export default function Spinner({ ...props }: { [x: string]: any }) {
  return (
    <div
      {...props}
      className={clsx(
        "w-6 h-6 border-4 border-gray-300 animate-spin rounded-[50%] border-l-brand-500 mx-auto",
        props.className
      )}
    />
  );
}
