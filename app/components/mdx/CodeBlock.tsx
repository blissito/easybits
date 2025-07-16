import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

interface CodeBlockProps {
  children: string;
  className?: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({
  children,
  className = "",
  language,
  title,
  showLineNumbers = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g., "language-javascript" -> "javascript")
  const detectedLanguage =
    language || className.replace(/language-/, "") || "text";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="relative my-6 group">
      {/* Header with title and copy button */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-white font-medium text-sm">{title}</span>
          )}
          <span className="text-gray-400 text-xs uppercase font-mono">
            {detectedLanguage}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors duration-200"
          title="Copy code"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="rounded-b-lg overflow-hidden">
        <SyntaxHighlighter
          language={detectedLanguage}
          style={vscDarkPlus}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            padding: "16px",
            background: "#2f343f",
            fontSize: "14px",
            fontFamily: '"Courier New", Courier, monospace',
            borderRadius: 0,
            border: "none",
            outline: "none",
          }}
          lineNumberStyle={{
            color: "#6b7280",
            fontSize: "12px",
            minWidth: "2.5em",
            paddingRight: "1em",
            userSelect: "none",
          }}
          codeTagProps={{
            style: {
              fontFamily: '"Courier New", Courier, monospace',
            },
          }}
        >
          {children.trim()}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Export a pre-configured version for MDX
export function Pre({ children, ...props }: any) {
  // Handle both direct code and code wrapped in <code> tags
  if (children?.props?.children) {
    return (
      <CodeBlock className={children.props.className} {...props}>
        {children.props.children}
      </CodeBlock>
    );
  }

  return <CodeBlock {...props}>{children}</CodeBlock>;
}

// Export a code component for inline code
export function Code({ children, className, ...props }: any) {
  // If it's a block code (has language class), use CodeBlock
  if (className?.startsWith("language-")) {
    return (
      <CodeBlock className={className} {...props}>
        {children}
      </CodeBlock>
    );
  }

  // Otherwise, render as inline code with existing styles
  return (
    <code className="markdown-inline-code" {...props}>
      {children}
    </code>
  );
}
