import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginationActions {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  reset: () => void;
}

export interface PaginationConfig {
  defaultPageSize: number;
  pageSizeOptions: number[];
  maxPageButtons: number;
}

export interface PaginationProviderProps {
  children: React.ReactNode;
  config?: Partial<PaginationConfig>;
  totalItems: number;
}

const defaultConfig: PaginationConfig = {
  defaultPageSize: 20,
  pageSizeOptions: [10, 20, 50, 100],
  maxPageButtons: 5,
};

interface PaginationContextValue {
  state: PaginationState;
  actions: PaginationActions;
  config: PaginationConfig;
}

const PaginationContext = createContext<PaginationContextValue | undefined>(
  undefined
);

export const PaginationProvider: React.FC<PaginationProviderProps> = ({
  children,
  config,
  totalItems,
}) => {
  const mergedConfig = { ...defaultConfig, ...config };
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(mergedConfig.defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const setPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1); // Reset to first page on page size change
  }, []);

  const nextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const reset = useCallback(() => {
    setCurrentPage(1);
    setPageSizeState(mergedConfig.defaultPageSize);
  }, [mergedConfig.defaultPageSize]);

  const state: PaginationState = useMemo(
    () => ({
      currentPage,
      pageSize,
      totalItems,
      totalPages,
    }),
    [currentPage, pageSize, totalItems, totalPages]
  );

  const actions: PaginationActions = useMemo(
    () => ({
      setPage,
      setPageSize,
      nextPage,
      previousPage,
      reset,
    }),
    [setPage, setPageSize, nextPage, previousPage, reset]
  );

  const value = useMemo(
    () => ({ state, actions, config: mergedConfig }),
    [state, actions, mergedConfig]
  );

  return (
    <PaginationContext.Provider value={value}>
      {children}
    </PaginationContext.Provider>
  );
};

export function usePaginationContext() {
  const ctx = useContext(PaginationContext);
  if (!ctx)
    throw new Error(
      "usePaginationContext must be used within a PaginationProvider"
    );
  return ctx;
}
