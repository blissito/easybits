// Markdown.tsx
import ReactMarkdown from "react-markdown";
// SyntaxHighlight.tsx
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  duotoneDark,
  a11yDark,
  dracula,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import rangeParser from "parse-numeric-range";

const SyntaxHighlight: object = {
  code({ node, inline, className, ...props }) {
    // Set code language declared in code block: ```lang
    const match = /language-(\w+)/.exec(className || "");

    // Check if we have metadata
    const hasMeta = node?.data?.meta;

    // Highlight lines declared in code block: ```lang {2,4-6}
    const applyHighlights: any = (applyHighlights: any) => {
      if (hasMeta) {
        const RE = /{([\d,-]+)}/;
        const metadata = node.data.meta?.replace(/\s/g, "");
        const strlineNumbers = RE.test(metadata) ? RE.exec(metadata)[1] : "0";
        const highlightLines = rangeParser(strlineNumbers);
        const highlight = highlightLines;
        const data: string = highlight.includes(applyHighlights)
          ? "highlight"
          : null;
        return { data };
      } else {
        return {};
      }
    };

    return !inline && match ? (
      <SyntaxHighlighter
        // style={colorMode === 'dark' ? duotoneDark : a11yDark}
        // style={theme === "dark" ? dracula : duotoneDark}
        style={dracula}
        language={match[1]}
        PreTag="div"
        className="codeStyle"
        // showLineNumbers={true}
        wrapLines={true}
        useunlinestyles={"true"}
        lineProps={applyHighlights}
        {...props}
      />
    ) : (
      <code className={className} {...props} />
    );
  },
};

export default function Markdown(props: any) {
  // @todo pass theme
  return (
    <div className="markdown">
      <ReactMarkdown components={SyntaxHighlight} {...props} />
    </div>
  );
}
