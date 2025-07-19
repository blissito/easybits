import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

interface CalloutProps {
  children: ReactNode;
  type?: "info" | "warning" | "error" | "success" | "tip";
  title?: string;
}

export function Callout({ children, type = "info", title }: CalloutProps) {
  const getCalloutStyles = () => {
    switch (type) {
      case "warning":
        return {
          container: "bg-yellow-50 border-yellow-500",
          icon: "text-yellow-600",
          title: "text-yellow-800",
          content: "text-yellow-700",
        };
      case "error":
        return {
          container: "bg-red-50 border-red-500",
          icon: "text-red-600",
          title: "text-red-800",
          content: "text-red-700",
        };
      case "success":
        return {
          container: "bg-green-50 border-green-500",
          icon: "text-green-600",
          title: "text-green-800",
          content: "text-green-700",
        };
      case "tip":
        return {
          container: "bg-purple-50 border-purple-500",
          icon: "text-purple-600",
          title: "text-purple-800",
          content: "text-purple-700",
        };
      default: // info
        return {
          container: "bg-blue-50 border-blue-500",
          icon: "text-blue-600",
          title: "text-blue-800",
          content: "text-blue-700",
        };
    }
  };

  const getIcon = () => {
    switch (type) {
      case "warning":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "error":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "success":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "tip":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      default: // info
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  const styles = getCalloutStyles();

  return (
    <div
      className={`relative p-4 my-6 border-2 border-black rounded-lg ${styles.container}`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 ${styles.icon}`}>{getIcon()}</div>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-semibold text-lg mb-2 ${styles.title}`}>
              {title}
            </h4>
          )}
          <div className={`${styles.content} prose prose-sm max-w-none`}>
            {typeof children === "string" ? (
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => (
                    <>
                      <a
                        href={href}
                        className="text-blue-600 hover:text-blue-800 underline"
                        target={href?.startsWith("http") ? "_blank" : undefined}
                        rel={
                          href?.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                      >
                        {children}
                      </a>
                      <br />
                    </>
                  ),
                }}
              >
                {children}
              </ReactMarkdown>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export pre-configured callout types for easier use
export const InfoCallout = ({
  children,
  title,
}: Omit<CalloutProps, "type">) => (
  <Callout type="info" title={title}>
    {children}
  </Callout>
);

export const WarningCallout = ({
  children,
  title,
}: Omit<CalloutProps, "type">) => (
  <Callout type="warning" title={title}>
    {children}
  </Callout>
);

export const ErrorCallout = ({
  children,
  title,
}: Omit<CalloutProps, "type">) => (
  <Callout type="error" title={title}>
    {children}
  </Callout>
);

export const SuccessCallout = ({
  children,
  title,
}: Omit<CalloutProps, "type">) => (
  <Callout type="success" title={title}>
    {children}
  </Callout>
);

export const TipCallout = ({ children, title }: Omit<CalloutProps, "type">) => (
  <Callout type="tip" title={title}>
    {children}
  </Callout>
);
