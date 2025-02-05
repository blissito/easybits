import { useState, type ReactNode } from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa";
import { useTimeout } from "~/hooks/useTimeout";
import { cn } from "~/utils/cn";
import { CopyIcon } from "../illustrations/CopyIcon";

export const CopyButton = ({
  className,
  text,
  children,
}: {
  className?: string;
  children?: ReactNode;
  text: string;
}) => {
  const [copied, setCopied] = useState(false);
  const { placeTimeout } = useTimeout();

  const handleCopyToClipboard = (text: string) => () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    placeTimeout(() => setCopied(false));
  };

  return (
    <button
      onClick={handleCopyToClipboard(text)}
      className={cn("w-max", className)}
    >
      <span>{copied ? <FaCheck /> : children || <CopyIcon />}</span>
    </button>
  );
};
