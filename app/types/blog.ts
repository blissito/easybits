export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  featuredImage?: string;
  readingTime: number;
  content: string;
  excerpt: string;
  published: boolean;
}

export interface BlogListOptions {
  page?: number;
  limit?: number;
  tag?: string;
  search?: string;
  author?: string;
}

export interface PaginatedBlogPosts {
  posts: BlogPost[];
  totalPosts: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
