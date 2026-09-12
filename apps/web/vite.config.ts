import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("node_modules")) return undefined;
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/react-router-dom/")
          ) {
            return "vendor-react";
          }
          if (normalizedId.includes("/node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          if (normalizedId.includes("/node_modules/@tanstack/")) {
            return "vendor-query";
          }
          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          if (
            normalizedId.includes("/node_modules/react-markdown/") ||
            normalizedId.includes("/node_modules/remark-gfm/") ||
            normalizedId.includes("/node_modules/micromark") ||
            normalizedId.includes("/node_modules/mdast") ||
            normalizedId.includes("/node_modules/unist") ||
            normalizedId.includes("/node_modules/hast")
          ) {
            return "vendor-markdown";
          }
          if (normalizedId.includes("/node_modules/three/")) {
            return "vendor-three";
          }
          if (normalizedId.includes("/node_modules/react-hook-form/") || normalizedId.includes("/node_modules/zod/")) {
            return "vendor-forms";
          }
          if (
            normalizedId.includes("/node_modules/axios/") ||
            normalizedId.includes("/node_modules/zustand/") ||
            normalizedId.includes("/node_modules/sonner/") ||
            normalizedId.includes("/node_modules/class-variance-authority/") ||
            normalizedId.includes("/node_modules/clsx/") ||
            normalizedId.includes("/node_modules/tailwind-merge/") ||
            normalizedId.includes("/node_modules/next-themes/")
          ) {
            return "vendor-app";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Optional: proxy /api during dev so cookies work without CORS.
      // Remove if you prefer hitting the backend directly via VITE_API_BASE.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
