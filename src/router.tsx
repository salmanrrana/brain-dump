import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
}

// Factory function to create QueryClient with consistent options
// Called per-request on server (SSR) and once on client
//
// staleTime/gcTime convention (local-first app — the app + MCP are the only writers):
// Two tiers govern how fresh a query is considered and how long the cache is kept.
//
//   (a) Config/snapshot data (projects, epics, tickets, settings):
//       long staleTime — serve from cache instantly on navigation and refresh via
//       TARGETED mutation invalidation, not by treating everything as stale. These
//       hooks inherit the 30s global staleTime below (matching defaultPreloadStaleTime
//       so hover-prefetched data is actually served, not immediately re-fetched).
//
//   (b) Live/polling data (active Ralph sessions, container/Docker status):
//       short staleTime aligned to the hook's own refetchInterval. These hooks
//       override staleTime locally to match their poll cadence.
//
// gcTime (30m) is intentionally much longer than staleTime so revisited routes keep
// their cached data warm well past the dev/work session, eliminating refetch-on-navigate.
// MCP-driven external changes still surface via mutation invalidation + the manual Refresh.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30s — snapshot tier; matches defaultPreloadStaleTime
        gcTime: 1000 * 60 * 30, // 30m — keep cache warm across navigations
        refetchOnWindowFocus: false, // Opt-in per query; global=true causes refetch storms
      },
    },
  });
}

// Create a new router instance
export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },

    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000, // 30s — allows hover-prefetch to serve cached data
  });

  return router;
};
