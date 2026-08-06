import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import faviconUrl from "../assets/tieck-favicon.png?url";
import ogImageUrl from "../assets/local/logo-tieck.webp";

function isRecoverableLoadingError(reason: unknown) {
  const text = String((reason as any)?.message || reason || "");
  return (
    text.includes("Failed to fetch dynamically imported module") ||
    text.includes("Importing a module script failed") ||
    text.includes("dynamically imported module") ||
    text.includes("No such module") ||
    text.includes("ChunkLoadError") ||
    text.includes("Loading chunk") ||
    text.includes("Loading CSS chunk")
  );
}

function forceFreshRouteReload() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const key = `tieck-route-reload:${url.pathname}`;
  const attempts = Number(sessionStorage.getItem(key) || 0);
  if (attempts >= 2) return;
  sessionStorage.setItem(key, String(attempts + 1));
  url.searchParams.set("_fresh", String(Date.now()));
  window.location.replace(url.toString());
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  console.error('Root error:', error);
  const router = useRouter();

  // Check if it's a "No such module" error which often indicates SSR/Module issues
  const isModuleError = isRecoverableLoadingError(error) || isRecoverableLoadingError(error?.stack);

  // Auto-recover from stale-bundle errors instead of leaving the user on the error page.
  useEffect(() => {
    if (isModuleError) forceFreshRouteReload();
  }, [isModuleError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-xl text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Erro de carregamento
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isModuleError 
            ? "A página estava com uma versão antiga em cache. Recarregue para buscar a versão mais recente."
            : "Não foi possível carregar esta página. Tente novamente ou volte para o início."}
        </p>
        
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-4 p-4 bg-red-50 text-red-700 text-xs text-left overflow-auto rounded-md max-h-48 border border-red-100">
            {error?.message || String(error)}
            {error?.stack && `\n\nStack:\n${error.stack}`}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (isModuleError) {
                forceFreshRouteReload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <Link
            to="/inicio"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Tieck — A forma mais simples de criar checklists" },
      { name: "description", content: "Crie checklists de forma simples, rápida e intuitiva. Organize suas tarefas de maneira gratuita e personalizada." },
      { name: "author", content: "Tieck" },
      { property: "og:title", content: "Tieck — A forma mais simples de criar checklists" },
      { property: "og:description", content: "Crie checklists de forma simples, rápida e intuitiva. Organize suas tarefas de maneira gratuita e personalizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Tieck — A forma mais simples de criar checklists" },
      { name: "twitter:description", content: "Crie checklists de forma simples, rápida e intuitiva. Organize suas tarefas de maneira gratuita e personalizada." },
      { property: "og:image", content: ogImageUrl },
      { name: "twitter:image", content: ogImageUrl },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" },
      { rel: "icon", type: "image/png", href: faviconUrl },
      { rel: "apple-touch-icon", href: faviconUrl },
    ],
    htmlAttrs: { lang: "pt-BR" },
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const handlePreloadError = (event: Event) => {
      event.preventDefault();
      forceFreshRouteReload();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isRecoverableLoadingError(event.reason)) forceFreshRouteReload();
    };

    const handleError = (event: ErrorEvent) => {
      if (isRecoverableLoadingError(event.error ?? event.message)) forceFreshRouteReload();
    };

    window.addEventListener("vite:preloadError", handlePreloadError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("vite:preloadError", handlePreloadError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarProvider>
          <WorkspaceProvider>
            <Outlet />
          </WorkspaceProvider>
        </SidebarProvider>
      </AuthProvider>
      <Toaster 
        position="bottom-right" 
        richColors 
        toastOptions={{
          className: "text-base py-4 px-6 min-w-[300px] sm:min-w-[400px] font-medium shadow-2xl",
        }}
      />
      <Analytics />
      <SpeedInsights />
    </QueryClientProvider>
  );
}
