import React from "react";
import { PaginationProvider } from "./PaginationProvider";
import { getOffset, getLimit } from "./PaginationUtils";
import { usePagination } from "./usePagination";

interface PaginatedTableProps<T> {
  data: T[];
  totalItems: number;
  children: (paginatedData: T[]) => React.ReactNode;
  config?: Partial<import("./PaginationProvider").PaginationConfig>;
}

export function PaginatedTable<T>({
  data,
  totalItems,
  children,
  config,
}: PaginatedTableProps<T>) {
  return (
    <PaginationProvider totalItems={totalItems} config={config}>
      <PaginatedTableInner data={data}>{children}</PaginatedTableInner>
    </PaginationProvider>
  );
}

function PaginatedTableInner<T>({
  data,
  children,
}: {
  data: T[];
  children: (paginatedData: T[]) => React.ReactNode;
}) {
  const { state } = usePagination();
  const offset = getOffset(state.currentPage, state.pageSize);
  const paginatedData = data.slice(offset, offset + state.pageSize);
  return <>{children(paginatedData)}</>;
}
