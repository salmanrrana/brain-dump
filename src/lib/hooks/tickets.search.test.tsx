import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchTickets } from "../../api/search";
import { useSearch } from "./tickets";

vi.mock("../../api/search", () => ({
  searchTickets: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSearch", () => {
  beforeEach(() => {
    vi.mocked(searchTickets).mockImplementation(async ({ data }) => [
      {
        id: data.query,
        title: `Result for ${data.query}`,
        description: "",
        status: "backlog",
        priority: null,
        projectId: data.projectId ?? "project-a",
        epicId: null,
        tags: null,
        snippet: data.query,
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("debounces search and reuses cached results for the same project query", async () => {
    const { result } = renderHook(() => useSearch("project-a"), { wrapper: createWrapper() });

    act(() => result.current.search("stale"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    act(() => result.current.search("fresh"));

    await waitFor(() => expect(result.current.results[0]?.title).toBe("Result for fresh"));
    expect(searchTickets).toHaveBeenCalledTimes(1);
    expect(searchTickets).toHaveBeenCalledWith({
      data: { query: "fresh", projectId: "project-a" },
    });

    act(() => result.current.clearSearch());
    expect(result.current.results).toEqual([]);

    act(() => result.current.search("fresh"));

    await waitFor(() => expect(result.current.results[0]?.title).toBe("Result for fresh"));
    expect(searchTickets).toHaveBeenCalledTimes(1);
  });
});
