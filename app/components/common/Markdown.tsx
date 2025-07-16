import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import rangeParser from "parse-numeric-range";
import { ImageGallery, Image } from "../mdx/ImageGallery";
import { Callout } from "../mdx/Callout";
import { CodeBlock } from "../mdx/CodeBlock";

interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const components = {
  // Custom components for MDX
  ImageGallery,
  Image,
  Callout,
  CodeBlock,

  // Enhanced code highlighting
  code({ node, inline, className, children, ...props }: CodeProps) {
    const match = /language-(\w+)/.exec(className || "");
    const hasMeta = node?.data?.meta;

    const applyHighlights = (lineNumber: number) => {
      if (hasMeta) {
        const RE = /{([\d,-]+)}/;
        const metadata = node.data.meta?.replace(/\s/g, "");
        const strlineNumbers = RE.test(metadata) ? RE.exec(metadata)?.[1] : "0";
        if (strlineNumbers) {
          const highlightLines = rangeParser(strlineNumbers);
          const shouldHighlight = highlightLines.includes(lineNumber);
          return shouldHighlight
            ? { style: { backgroundColor: "#374151" } }
            : {};
        }
      }
      return {};
    };

    return !inline && match ? (
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        className="rounded-lg border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] my-6"
        showLineNumbers={true}
        wrapLines={true}
        lineProps={applyHighlights}
        {...props}
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code
        className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono border border-gray-300"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Enhanced headings with better hierarchy
  h1: ({ children, ...props }: any) => (
    <h1
      className="text-4xl md:text-5xl font-bold text-gray-900 mb-8 mt-12 leading-tight tracking-tight"
      {...props}
    >
      {children}
    </h1>
  ),

  h2: ({ children, ...props }: any) => (
    <h2
      className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 mt-10 leading-tight tracking-tight border-b-2 border-black pb-3"
      {...props}
    >
      {children}
    </h2>
  ),

  h3: ({ children, ...props }: any) => (
    <h3
      className="text-2xl md:text-3xl font-bold text-gray-900 mb-5 mt-8 leading-tight"
      {...props}
    >
      {children}
    </h3>
  ),

  h4: ({ children, ...props }: any) => (
    <h4
      className="text-xl md:text-2xl font-semibold text-gray-900 mb-4 mt-6 leading-tight"
      {...props}
    >
      {children}
    </h4>
  ),

  h5: ({ children, ...props }: any) => (
    <h5
      className="text-lg md:text-xl font-semibold text-gray-900 mb-3 mt-5 leading-tight"
      {...props}
    >
      {children}
    </h5>
  ),

  h6: ({ children, ...props }: any) => (
    <h6
      className="text-base md:text-lg font-semibold text-gray-900 mb-3 mt-4 leading-tight"
      {...props}
    >
      {children}
    </h6>
  ),

  // Enhanced paragraphs with optimal reading
  p: ({ children, ...props }: any) => (
    <p
      className="text-lg md:text-xl leading-relaxed text-gray-700 mb-6 max-w-none"
      style={{ fontFamily: "inherit" }}
      {...props}
    >
      {children}
    </p>
  ),

  // Better lists
  ul: ({ children, ...props }: any) => (
    <ul
      className="list-disc list-outside ml-6 mb-6 space-y-2 text-lg md:text-xl text-gray-700"
      style={{ fontFamily: "inherit" }}
      {...props}
    >
      {children}
    </ul>
  ),

  ol: ({ children, ...props }: any) => (
    <ol
      className="list-decimal list-outside ml-6 mb-6 space-y-2 text-lg md:text-xl text-gray-700"
      style={{ fontFamily: "inherit" }}
      {...props}
    >
      {children}
    </ol>
  ),

  li: ({ children, ...props }: any) => (
    <li
      className="leading-relaxed mb-1"
      style={{ fontFamily: "inherit" }}
      {...props}
    >
      {children}
    </li>
  ),

  // Enhanced blockquotes
  blockquote: ({ children, ...props }: any) => (
    <blockquote
      className="border-l-4 border-black bg-gray-50 pl-6 pr-4 py-4 my-8 italic text-lg md:text-xl text-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Better links
  a: ({ children, href, ...props }: any) => (
    <a
      href={href}
      className="text-blue-600 hover:text-blue-800 underline decoration-2 underline-offset-2 hover:decoration-blue-800 transition-colors font-medium"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),

  // Enhanced tables
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-8">
      <table
        className="min-w-full border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        {...props}
      >
        {children}
      </table>
    </div>
  ),

  thead: ({ children, ...props }: any) => (
    <thead className="bg-black text-white" {...props}>
      {children}
    </thead>
  ),

  th: ({ children, ...props }: any) => (
    <th className="px-6 py-4 text-left text-lg font-semibold" {...props}>
      {children}
    </th>
  ),

  td: ({ children, ...props }: any) => (
    <td
      className="px-6 py-4 text-lg text-gray-700 border-t border-gray-300"
      {...props}
    >
      {children}
    </td>
  ),

  // Horizontal rule
  hr: ({ ...props }: any) => (
    <hr className="border-0 border-t-2 border-black my-12" {...props} />
  ),

  // Strong and emphasis
  strong: ({ children, ...props }: any) => (
    <strong className="font-bold text-gray-900" {...props}>
      {children}
    </strong>
  ),

  em: ({ children, ...props }: any) => (
    <em className="italic text-gray-800" {...props}>
      {children}
    </em>
  ),
};

export default function Markdown(props: any) {
  return (
    <div className="markdown prose prose-lg max-w-none">
      <ReactMarkdown components={components} {...props} />
    </div>
  );
}
