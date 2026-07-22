// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
 import { defineConfig } from "@lovable.dev/vite-tanstack-config";
 
 export default defineConfig({
    nitro: {
      preset: "vercel",
    },
    vite: {
      ssr: {
        noExternal: [
          "h3-v2", 
          "rou3", 
          "srvx", 
          "@tanstack/router-core", 
          "@tanstack/react-router", 
          "@tanstack/react-start",
          "@tanstack/history",
          "@tanstack/react-query",
          "@tanstack/query-core",
          "lucide-react",
          "clsx",
          "tailwind-merge"
        ],
      },
    },
 });
