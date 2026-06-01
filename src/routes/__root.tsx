import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RouterContext } from "../router";
// Side-effect imports: dev-only performance instrumentation
import { markHydrationComplete } from "../lib/navigation-timing";
import { setQueryClientForHealth } from "../lib/session-health";

import AppLayout from "../components/AppLayout";
import { SplashScreen } from "../components/SplashScreen";
import { ToastProvider } from "../components/Toast";
import { ThemeProvider, THEME_STORAGE_KEY, THEMES, DEFAULT_THEME } from "../lib/theme";

import appCss from "../styles.css?url";

const DevelopmentDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }] = await Promise.all([
        import("@tanstack/react-devtools"),
        import("@tanstack/react-router-devtools"),
      ]);

      return {
        default: function DevelopmentDevtoolsPanel() {
          return (
            <TanStackDevtools
              config={{ position: "bottom-right" }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          );
        },
      };
    })
  : null;

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

// sessionStorage key that records the splash has already played in this tab
// session, so full-reload revisits skip it entirely.
const SPLASH_SHOWN_KEY = "bd:splash-shown";

// `useSyncExternalStore` needs a subscribe function; our snapshots never change
// after the first read, so subscription is a no-op.
const noopSubscribe = () => () => {};

// Whether the splash is allowed to play this page load. Decided once, cached, so
// later writes to the sessionStorage flag never retroactively change the answer
// (which would hide the splash mid-show). Returns false on full-reload revisits.
let cachedSplashAllowed: boolean | undefined;
function getSplashAllowedSnapshot(): boolean {
  if (cachedSplashAllowed === undefined) {
    try {
      cachedSplashAllowed = sessionStorage.getItem(SPLASH_SHOWN_KEY) !== "1";
    } catch {
      // sessionStorage unavailable (e.g. privacy mode) — show the splash normally.
      cachedSplashAllowed = true;
    }
  }
  return cachedSplashAllowed;
}

// Reset the cache when this module is hot-reloaded so splash iteration in dev
// re-reads sessionStorage instead of being pinned to the first decision.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cachedSplashAllowed = undefined;
  });
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext();
  const [dismissed, setDismissed] = useState(false);

  // `hydrated` is false during SSR and the first client render (matching the
  // server), then true once React has hydrated — without setState in an effect.
  // This is the readiness signal the splash dismisses on.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  // Splash only plays on a true cold boot; revisits within the session skip it.
  const splashAllowed = useSyncExternalStore(noopSubscribe, getSplashAllowedSnapshot, () => true);
  const showSplash = splashAllowed && !dismissed;

  // Record that the splash has played this session + dev performance marks.
  useEffect(() => {
    // Only mark "shown" when the splash actually plays (cold boot), not on
    // suppressed revisits where the flag is already set.
    if (splashAllowed) {
      try {
        sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
      } catch {
        // sessionStorage unavailable — nothing to persist.
      }
    }

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
  }, [queryClient, splashAllowed]);

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
              {showSplash && (
                <SplashScreen ready={hydrated} onComplete={() => setDismissed(true)} />
              )}
              <AppLayout>{children}</AppLayout>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
        {DevelopmentDevtools && (
          <Suspense fallback={null}>
            <DevelopmentDevtools />
          </Suspense>
        )}
        <Scripts />
      </body>
    </html>
  );
}
