import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { usePaginationContext } from "./PaginationProvider";

export function usePagination() {
  const { state, actions, config } = usePaginationContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sincroniza el estado de paginación con los parámetros de la URL
  useEffect(() => {
    const page = Number(searchParams.get("page")) || 1;
    const pageSize =
      Number(searchParams.get("pageSize")) || config.defaultPageSize;
    if (state.currentPage !== page) actions.setPage(page);
    if (state.pageSize !== pageSize) actions.setPageSize(pageSize);
    // eslint-disable-next-line
  }, [searchParams]);

  useEffect(() => {
    setSearchParams({
      ...Object.fromEntries(searchParams.entries()),
      page: String(state.currentPage),
      pageSize: String(state.pageSize),
    });
    // eslint-disable-next-line
  }, [state.currentPage, state.pageSize]);

  // Helpers para navegación
  const canGoNext = state.currentPage < state.totalPages;
  const canGoPrevious = state.currentPage > 1;

  // Calcula los números de página a mostrar
  const pageNumbers = (() => {
    const max = config.maxPageButtons;
    const total = state.totalPages;
    const current = state.currentPage;
    if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
    const half = Math.floor(max / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(total, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  return {
    state,
    actions,
    canGoNext,
    canGoPrevious,
    pageNumbers,
  };
}
