// @ts-nocheck
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "~/components/mdx/CodeBlock";
import { ImageGallery } from "~/components/mdx/ImageGallery";
import { Callout } from "~/components/mdx/Callout";
import type { BlogPost } from "~/types/blog";

interface PostContentProps {
  post: BlogPost;
}

// Custom component to render MDX components from JSX-like syntax in markdown
const renderMDXComponents = (content: string) => {
  const parts = [];
  let processedContent = content;

  // Process ImageGallery components
  const imageGalleryRegex = /<ImageGallery\s+([^>]+)\/>/g;
  let match;
  let lastIndex = 0;

  while ((match = imageGalleryRegex.exec(processedContent)) !== null) {
    // Add content before the ImageGallery
    if (match.index > lastIndex) {
      parts.push({
        type: "markdown",
        content: processedContent.slice(lastIndex, match.index),
      });
    }

    // Parse ImageGallery props
    const propsString = match[1];
    try {
      // Extract images array and other props
      const imagesMatch = propsString.match(/images=\{(\[[\s\S]*?\])\}/);
      const columnsMatch = propsString.match(/columns=\{(\d+)\}/);
      const showCaptionsMatch = propsString.match(
        /showCaptions=\{(true|false)\}/
      );

      if (imagesMatch) {
        // Parse the images array (this is a simplified parser)
        const imagesStr = imagesMatch[1];
        const images = eval(imagesStr); // Note: In production, use a proper JSON parser

        parts.push({
          type: "component",
          component: "ImageGallery",
          props: {
            images,
            columns: columnsMatch
              ? (parseInt(columnsMatch[1]) as 1 | 2 | 3 | 4)
              : 2,
            showCaptions: showCaptionsMatch
              ? showCaptionsMatch[1] === "true"
              : true,
          },
        });
      }
    } catch (error) {
      console.error("Error parsing ImageGallery props:", error);
      // If parsing fails, just add the raw content
      parts.push({
        type: "markdown",
        content: match[0],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining content after ImageGallery processing
  if (lastIndex < processedContent.length) {
    parts.push({
      type: "markdown",
      content: processedContent.slice(lastIndex),
    });
  }

  // Now process Callout components in the parts
  const finalParts = [];
  for (const part of parts) {
    if (part.type === "markdown") {
      const calloutParts = processCallouts(part.content);
      finalParts.push(...calloutParts);
    } else {
      finalParts.push(part);
    }
  }

  return finalParts;
};

// Process Callout components
const processCallouts = (content: string) => {
  const calloutRegex = /<Callout\s+([^>]*?)>([\s\S]*?)<\/Callout>/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = calloutRegex.exec(content)) !== null) {
    // Add content before the Callout
    if (match.index > lastIndex) {
      parts.push({
        type: "markdown",
        content: content.slice(lastIndex, match.index),
      });
    }

    // Parse Callout props
    const propsString = match[1];
    const calloutContent = match[2];

    try {
      const typeMatch = propsString.match(/type="([^"]*?)"/);
      const titleMatch = propsString.match(/title="([^"]*?)"/);

      parts.push({
        type: "component",
        component: "Callout",
        props: {
          type: typeMatch ? typeMatch[1] : "info",
          title: titleMatch ? titleMatch[1] : undefined,
          children: calloutContent.trim(),
        },
      });
    } catch (error) {
      console.error("Error parsing Callout props:", error);
      // If parsing fails, just add the raw content
      parts.push({
        type: "markdown",
        content: match[0],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining content
  if (lastIndex < content.length) {
    parts.push({
      type: "markdown",
      content: content.slice(lastIndex),
    });
  }

  return parts;
};

export const PostContent = ({ post }: PostContentProps) => {
  const contentParts = renderMDXComponents(post.content);

  return (
    <section className="max-w-3xl mx-auto pb-10">
      <div className="markdown">
        {contentParts.map((part, index) => {
          if (part.type === "component" && part.component === "ImageGallery") {
            return (
              <ImageGallery
                key={index}
                images={part.props.images}
                columns={part.props.columns}
                showCaptions={part.props.showCaptions}
              />
            );
          } else if (
            part.type === "component" &&
            part.component === "Callout"
          ) {
            return (
              <Callout
                key={index}
                type={
                  part.props.type as
                    | "info"
                    | "warning"
                    | "error"
                    | "success"
                    | "tip"
                }
                title={part.props.title}
              >
                {part.props.children}
              </Callout>
            );
          } else {
            return (
              <ReactMarkdown
                key={index}
                remarkPlugins={[remarkGfm]}
                components={{
                  // Remove H1 titles to avoid duplication with post header
                  h1: () => null,
                  // Un fence SIN lenguaje (```) también es bloque: react-markdown lo
                  // envuelve en <pre>, así que el bloque se decide aquí y no por
                  // `language-*`. Antes caía al <code> inline y perdía los saltos de línea.
                  pre: ({ children }) => {
                    const child = Array.isArray(children) ? children[0] : children;
                    const cp = (child as any)?.props ?? {};
                    const lang = /language-(\w+)/.exec(cp.className || "")?.[1] ?? "text";
                    return (
                      <CodeBlock language={lang} className={cp.className}>
                        {String(cp.children ?? "").replace(/\n$/, "")}
                      </CodeBlock>
                    );
                  },
                  code: ({ className, children, ...props }) => (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  ),
                }}
              >
                {part.content}
              </ReactMarkdown>
            );
          }
        })}
      </div>
    </section>
  );
};
