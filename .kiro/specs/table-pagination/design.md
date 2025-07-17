# Design Document

## Overview

This design document outlines the implementation of pagination functionality for the sales and clients tables in the EasyBits application. The solution will create reusable pagination components that can be integrated with existing table components while maintaining performance and user experience standards.

The pagination system will be built as a set of reusable React components that handle both client-side and server-side pagination scenarios, with URL state management for bookmarkable pages and seamless integration with existing filtering and sorting functionality.

## Architecture

### Component Architecture

```
PaginationProvider (Context)
├── usePagination (Hook)
├── PaginatedTable (Wrapper Component)
│   ├── TablePagination (Controls Component)
│   │   ├── PageSizeSelector
│   │   ├── PageNavigation
│   │   └── PaginationInfo
│   └── [Existing Table Component]
└── PaginationUtils (Helper Functions)
```

### Data Flow

1. **URL State Management**: Pagination state (page, pageSize) is synchronized with URL search parameters
2. **Server Integration**: Loader functions receive pagination parameters and return paginated data
3. **Client State**: React context manages pagination state and provides actions to components
4. **Table Integration**: Existing table components receive paginated data without modification

### State Management Strategy

The pagination state will be managed through:

- URL search parameters for persistence and bookmarking
- React Context for component communication
- Server loaders for data fetching with pagination parameters

## Components and Interfaces

### Core Interfaces

```typescript
interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface PaginationActions {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  reset: () => void;
}

interface PaginatedData<T> {
  items: T[];
  pagination: PaginationState;
}

interface PaginationConfig {
  defaultPageSize: number;
  pageSizeOptions: number[];
  maxPageButtons: number;
}
```

### PaginationProvider Component

A React context provider that manages pagination state and URL synchronization:

```typescript
interface PaginationProviderProps {
  children: React.ReactNode;
  config?: Partial<PaginationConfig>;
  totalItems: number;
}
```

### usePagination Hook

Custom hook that provides pagination state and actions:

```typescript
interface UsePaginationReturn {
  state: PaginationState;
  actions: PaginationActions;
  canGoNext: boolean;
  canGoPrevious: boolean;
  pageNumbers: number[];
}
```

### PaginatedTable Component

Wrapper component that adds pagination to existing tables:

```typescript
interface PaginatedTableProps<T> {
  data: T[];
  totalItems: number;
  children: (paginatedData: T[]) => React.ReactNode;
  config?: Partial<PaginationConfig>;
}
```

### TablePagination Component

UI component that renders pagination controls:

```typescript
interface TablePaginationProps {
  showPageSizeSelector?: boolean;
  showPaginationInfo?: boolean;
  className?: string;
}
```

## Data Models

### Server-Side Pagination Parameters

```typescript
interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
```

### URL Search Parameters

The pagination state will be reflected in URL search parameters:

- `page`: Current page number (default: 1)
- `pageSize`: Items per page (default: 20)

Example: `/dash/ventas?page=2&pageSize=50`

## Error Handling

### Client-Side Error Handling

1. **Invalid Page Numbers**: Automatically redirect to valid page range
2. **Invalid Page Sizes**: Fall back to default page size
3. **Network Errors**: Show error state with retry option
4. **Empty Results**: Display appropriate empty state message

### Server-Side Error Handling

1. **Database Query Errors**: Return appropriate HTTP status codes
2. **Invalid Parameters**: Validate and sanitize pagination parameters
3. **Performance Limits**: Implement maximum page size limits

### Error Recovery Strategies

```typescript
interface PaginationErrorState {
  hasError: boolean;
  errorMessage?: string;
  canRetry: boolean;
}
```

## Testing Strategy

### Unit Tests

1. **usePagination Hook Tests**

   - State management functionality
   - URL synchronization
   - Edge cases (invalid pages, empty data)

2. **Component Tests**

   - PaginationProvider context behavior
   - TablePagination UI interactions
   - PaginatedTable data handling

3. **Utility Function Tests**
   - Pagination calculations
   - URL parameter parsing
   - Data transformation functions

### Integration Tests

1. **Sales Table Integration**

   - Full pagination workflow
   - Filter and sort preservation
   - URL state management

2. **Clients Table Integration**
   - Pagination with existing features
   - Performance with large datasets
   - Error handling scenarios

### Performance Tests

1. **Large Dataset Handling**

   - Memory usage with large page sizes
   - Rendering performance
   - Server response times

2. **User Interaction Tests**
   - Page navigation responsiveness
   - Page size change performance
   - Concurrent user scenarios

## Implementation Approach

### Phase 1: Core Pagination Infrastructure

- Create pagination context and hooks
- Implement URL state synchronization
- Build reusable pagination components

### Phase 2: Sales Table Integration

- Modify sales loader for pagination
- Integrate pagination with SalesTable component
- Add pagination controls to sales page

### Phase 3: Clients Table Integration

- Modify clients loader for pagination
- Integrate pagination with ClientsTable component
- Add pagination controls to clients page

### Phase 4: Enhancement and Optimization

- Add advanced features (jump to page, keyboard navigation)
- Optimize performance for large datasets
- Implement comprehensive error handling

### Database Query Optimization

For server-side pagination, the existing Prisma queries will be modified to include:

```typescript
// Sales pagination
const orders = await db.order.findMany({
  where: {
    /* existing filters */
  },
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: "desc" },
});

const totalOrders = await db.order.count({
  where: {
    /* same filters */
  },
});
```

### URL Integration Strategy

The pagination will integrate with React Router's search parameters:

- Use `useSearchParams` for URL state management
- Preserve existing query parameters (filters, search)
- Provide clean, bookmarkable URLs

This design ensures a scalable, maintainable pagination system that integrates seamlessly with the existing EasyBits application architecture while providing excellent user experience and performance.
