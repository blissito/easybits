import React from "react";
import { usePagination } from "./usePagination";

interface TablePaginationProps {
  showPageSizeSelector?: boolean;
  showPaginationInfo?: boolean;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  showPageSizeSelector = true,
  showPaginationInfo = true,
  className = "",
}) => {
  const { state, actions, canGoNext, canGoPrevious, pageNumbers } =
    usePagination();
  const { currentPage, pageSize, totalItems, totalPages } = state;

  // No mostrar la paginación si solo hay una página
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <button onClick={actions.previousPage} disabled={!canGoPrevious}>
        &lt;
      </button>
      <div className="flex gap-1">
        {pageNumbers.map((num) => (
          <button
            key={num}
            onClick={() => actions.setPage(num)}
            className={num === currentPage ? "font-bold underline" : ""}
          >
            {num}
          </button>
        ))}
      </div>
      <button onClick={actions.nextPage} disabled={!canGoNext}>
        &gt;
      </button>
      {showPageSizeSelector && (
        <select
          value={pageSize}
          onChange={(e) => actions.setPageSize(Number(e.target.value))}
        >
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size} / página
            </option>
          ))}
        </select>
      )}
      {showPaginationInfo && (
        <span>
          Mostrando {(currentPage - 1) * pageSize + 1}-
          {Math.min(currentPage * pageSize, totalItems)} de {totalItems}
        </span>
      )}
    </div>
  );
};
