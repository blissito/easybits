import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PaginationProvider } from "~/components/common/pagination/PaginationProvider";
import { usePagination } from "~/components/common/pagination/usePagination";

function Probe() {
  const { state } = usePagination();
  return <span>{state.totalPages}</span>;
}

describe("usePagination dentro del router de la app (react-router v8)", () => {
  it("no revienta: useSearchParams usa el mismo router que MemoryRouter", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <PaginationProvider totalItems={100}>
          <Probe />
        </PaginationProvider>
      </MemoryRouter>
    );
    expect(html).toContain("5");
  });
});
