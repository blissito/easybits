import { FaCheck } from "react-icons/fa";
import { cn } from "~/utils/cn";

export const Badge = ({
  text,
  label,
  mode = "default",
}: {
  mode?: "default" | "hidden";
  text: string;
  label?: string;
}) => {
  label = mode === "hidden" ? undefined : "Cuenta conectada";
  return (
    <div
      className={cn(
        "mt-3 text-[11px] flex w-full items-center gap-2 rounded bg-status-success-overlay text-status-success pl-2 py-1",
        {
          hidden: mode === "hidden",
        }
      )}
    >
      <FaCheck className="mt-[2px]" />
      <p>
        <strong>{label} </strong>
        <span>{text}</span>
      </p>
    </div>
  );
};
