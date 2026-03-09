import { useState } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AppLayout from "../components/AppLayout";
import { SplashScreen } from "../components/SplashScreen";
import { ToastProvider } from "../components/Toast";
import { ThemeProvider, THEME_STORAGE_KEY, THEMES, DEFAULT_THEME } from "../lib/theme";

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
    scripts: [
      {
        // Blocking script to apply theme from localStorage before React hydrates.
        // Prevents flash of wrong theme (FOWT) on page load.
        children: `(function(){try{var k="${THEME_STORAGE_KEY}",v=["${THEMES.join('","')}"],t=localStorage.getItem(k);if(t&&v.indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t)}else{document.documentElement.setAttribute("data-theme","${DEFAULT_THEME}")}}catch(e){}})()`,
      },
    ],
  }),

  shellComponent: RootDocument,

  notFoundComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-[var(--text-secondary)]">
      <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4">404</h1>
      <p className="text-lg">Page not found</p>
    </div>
  ),
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside component state to avoid SSR issues
  // This ensures the focus manager is properly initialized on the client
  // See: https://tanstack.com/query/latest/docs/framework/react/guides/ssr
  const [queryClient] = useState(createQueryClient);
  const [showSplash, setShowSplash] = useState(true);

  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
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
              {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
              <AppLayout>{children}</AppLayout>
            </ToastProvider>
          </ThemeProvider>
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
