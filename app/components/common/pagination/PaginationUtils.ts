export function getOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function getLimit(pageSize: number): number {
  return pageSize;
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(page, totalPages));
}

export function clampPageSize(
  pageSize: number,
  allowedSizes: number[],
  defaultSize: number
): number {
  return allowedSizes.includes(pageSize) ? pageSize : defaultSize;
}
