import { useEffect, useState } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { RouterContext } from "../router";
// Side-effect imports: dev-only performance instrumentation
import { markHydrationComplete } from "../lib/navigation-timing";
import { setQueryClientForHealth } from "../lib/session-health";

import AppLayout from "../components/AppLayout";
import { SplashScreen } from "../components/SplashScreen";
import { ToastProvider } from "../components/Toast";
import { ThemeProvider, THEME_STORAGE_KEY, THEMES, DEFAULT_THEME } from "../lib/theme";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
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
      // Geist font family - preconnect for speed
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous" as const,
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap",
      },
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
  const { queryClient } = Route.useRouteContext();
  const [showSplash, setShowSplash] = useState(true);

  // Mark app boot + hydration completion for Performance timeline + connect health monitor
  useEffect(() => {
    if (import.meta.env.DEV) {
      performance.mark("app:boot:end");
      try {
        performance.measure("App Boot", "app:boot:start", "app:boot:end");
      } catch {
        // boot:start mark may not exist on HMR
      }
      markHydrationComplete();
      setQueryClientForHealth(queryClient);
    }
  }, [queryClient]);

  return (
    <html lang="en" className="dark" data-theme={DEFAULT_THEME} suppressHydrationWarning>
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
          config={{ position: "bottom-right" }}
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
