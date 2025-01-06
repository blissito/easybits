import { useState } from "react";
import { FaCopy } from "react-icons/fa";
import { useTimeout } from "~/hooks/useTimeout";

export const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const { placeTimeout } = useTimeout();

  const handleCopyToClipboard = (text: string) => () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    placeTimeout(() => setCopied(false));
  };

  return (
    <button onClick={handleCopyToClipboard(text)}>
      <span>{copied ? "✅" : <FaCopy />}</span>
    </button>
  );
};
