import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
}

// Factory function to create QueryClient with consistent options
// Called per-request on server (SSR) and once on client
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 5, // 5 seconds global default
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
