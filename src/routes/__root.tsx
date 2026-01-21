import { useState } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import AppLayout from "../components/AppLayout";
import { ToastProvider } from "../components/Toast";
import { ThemeProvider } from "../lib/theme";

import appCss from "../styles.css?url";

// Factory function to create QueryClient with consistent options
// Used inside useState to ensure per-component instance (SSR safety)
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Shorter staleTime to allow faster refresh when returning from external changes
        staleTime: 1000 * 5, // 5 seconds
        refetchOnWindowFocus: true, // Refetch stale queries when window regains focus
      },
    },
  });
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Brain Dump",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,

  notFoundComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
      <h1 className="text-4xl font-bold text-slate-200 mb-4">404</h1>
      <p className="text-lg">Page not found</p>
    </div>
  ),
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside component state to avoid SSR issues
  // This ensures the focus manager is properly initialized on the client
  // See: https://tanstack.com/query/latest/docs/framework/react/guides/ssr
  const [queryClient] = useState(createQueryClient);

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="h-screen overflow-hidden">
        {/* Skip to content link - appears first in DOM for keyboard users */}
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AppLayout>{children}</AppLayout>
            </ToastProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
