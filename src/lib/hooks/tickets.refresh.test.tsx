import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { getTicketSummaries } from "../../api/tickets";
import { useTicketSummaries } from "./tickets";

vi.mock("../../api/tickets", () => ({ getTicketSummaries: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

it("keeps even an empty cached board available when background refresh fails", async () => {
  vi.mocked(getTicketSummaries).mockResolvedValueOnce([]).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useTicketSummaries(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.hasData).toBe(true));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.error).toBe("offline"));
  expect(result.current.hasData).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.tickets).toEqual([]);
});

it("distinguishes an initial load failure from cached data", async () => {
  vi.mocked(getTicketSummaries).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useTicketSummaries(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.error).toBe("offline"));
  expect(result.current.hasData).toBe(false);
});
