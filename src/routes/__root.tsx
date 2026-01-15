import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import AppLayout from "../components/AppLayout";
import { ToastProvider } from "../components/Toast";

import appCss from "../styles.css?url";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds - allows faster refresh when returning from external changes
      refetchOnWindowFocus: true, // Refetch stale queries when window regains focus
    },
  },
});

export { queryClient };

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
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AppLayout>{children}</AppLayout>
          </ToastProvider>
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
