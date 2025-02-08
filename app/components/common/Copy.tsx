import { useState } from "react";
import { FaCheck } from "react-icons/fa";
import { CopyIcon } from "../illustrations/CopyIcon";
import { useTimeout } from "~/hooks/useTimeout";
import { cn } from "~/utils/cn";
/**
 * This component need a relative parent
 *  right-2 top-6 are designed to work insie an input label tag.
 * You can fix the top by passing it in the className prop
 * @param text
 * @param className
 *
 */
export const Copy = ({
  text,
  className,
}: {
  className?: string;
  text: string;
}) => {
  const { placeTimeout, cancelTimeout } = useTimeout(2000);
  const [isActive, setIsActive] = useState(false);
  const handleActualCopy = () => navigator.clipboard.writeText(text);
  const trigger = () => {
    cancelTimeout();
    setIsActive(true);
    placeTimeout(() => {
      setIsActive(false);
    });
    handleActualCopy();
  };

  return (
    <button
      onClick={trigger}
      className={cn(
        "w-max h-max",
        "hover:shadow",
        "transition-all",
        "p-1 rounded-lg border absolute right-2 top-6 bg-white",
        "active:scale-95 active:shadow-inner",
        className
      )}
    >
      {isActive ? (
        <span className="text-xl">
          <FaCheck />
        </span>
      ) : (
        <CopyIcon />
      )}
    </button>
  );
};
