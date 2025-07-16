export class BlogError extends Error {
  constructor(
    message: string,
    public type:
      | "SYNTAX_ERROR"
      | "MISSING_FRONTMATTER"
      | "INVALID_DATE"
      | "FILE_NOT_FOUND"
      | "PROCESSING_ERROR",
    public filePath?: string
  ) {
    super(message);
    this.name = "BlogError";
  }
}

export function createBlogError(
  type: BlogError["type"],
  message: string,
  filePath?: string
): BlogError {
  return new BlogError(message, type, filePath);
}
