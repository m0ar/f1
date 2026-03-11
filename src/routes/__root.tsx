/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  createRootRoute,
  Link,
  Outlet,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { YearSelector } from "@/components/year-selector";
import { DevSettings } from "@/components/dev-settings";
import { usePreferences } from "@/stores/preferences";
import appCss from "@/styles.css?url";

// Create a client - using useState to ensure it's created once per app instance
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we want to avoid refetching immediately on the client
        staleTime: 30_000,
        // Don't retry on error during development
        retry: process.env.NODE_ENV === "production" ? 3 : false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "F1 Betting Tracker" },
      {
        name: "description",
        content: "Track your F1 season predictions and see who's winning",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted-foreground mb-6">Page not found</p>
      <Link to="/" className="text-primary hover:underline">
        Back to Leaderboard
      </Link>
    </div>
  );
}

function RootComponent() {
  const theme = usePreferences((state) => state.theme);
  const [isClient, setIsClient] = useState(false);
  const queryClient = getQueryClient();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme, isClient]);

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 container mx-auto px-4 py-4 md:py-6">
              <Outlet />
            </main>
          </div>
          <DevSettings />
        </TooltipProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = [
    { path: "/", label: "Leaderboard" },
    { path: "/drivers", label: "Drivers" },
    { path: "/constructors", label: "Constructors" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-4 md:gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-bold text-lg">F1 Bets</span>
            </Link>
            {/* Desktop navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    currentPath === tab.path
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <YearSelector />
            <ThemeToggle />
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
      {/* Mobile navigation dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto px-4 py-2 flex flex-col gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.path}
                to={tab.path}
                className={`px-3 py-3 text-sm font-medium rounded-md transition-colors ${
                  currentPath === tab.path
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
