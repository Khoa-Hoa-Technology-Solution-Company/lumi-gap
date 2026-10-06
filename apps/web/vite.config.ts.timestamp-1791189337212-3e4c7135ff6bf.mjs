// vite.config.ts
import { defineConfig } from "file:///D:/capstone_26/lumi-gap/apps/web/node_modules/vite/dist/node/index.js";
import react from "file:///D:/capstone_26/lumi-gap/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "node:path";
var __vite_injected_original_dirname = "D:\\capstone_26\\lumi-gap\\apps\\web";
var vite_config_default = defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.endsWith("/src/i18n/locales/en.ts")) {
            return "i18n-en";
          }
          if (normalizedId.endsWith("/src/i18n/locales/new-ui.ts")) {
            return "i18n-new-ui";
          }
          if (!normalizedId.includes("node_modules")) return void 0;
          if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/") || normalizedId.includes("/node_modules/react-router-dom/")) {
            return "vendor-react";
          }
          if (normalizedId.includes("/node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          if (normalizedId.includes("/node_modules/@tanstack/")) {
            return "vendor-query";
          }
          if (normalizedId.includes("/node_modules/react-markdown/") || normalizedId.includes("/node_modules/remark-gfm/") || normalizedId.includes("/node_modules/micromark") || normalizedId.includes("/node_modules/mdast") || normalizedId.includes("/node_modules/unist") || normalizedId.includes("/node_modules/hast")) {
            return "vendor-markdown";
          }
          if (normalizedId.includes("/node_modules/three/")) {
            return "vendor-three";
          }
          if (normalizedId.includes("/node_modules/react-hook-form/") || normalizedId.includes("/node_modules/zod/")) {
            return "vendor-forms";
          }
          if (normalizedId.includes("/node_modules/axios/") || normalizedId.includes("/node_modules/zustand/") || normalizedId.includes("/node_modules/sonner/") || normalizedId.includes("/node_modules/class-variance-authority/") || normalizedId.includes("/node_modules/clsx/") || normalizedId.includes("/node_modules/tailwind-merge/") || normalizedId.includes("/node_modules/next-themes/")) {
            return "vendor-app";
          }
          return void 0;
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 3e3,
    proxy: {
      // Optional: proxy /api during dev so cookies work without CORS.
      // Remove if you prefer hitting the backend directly via VITE_API_BASE.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxjYXBzdG9uZV8yNlxcXFxsdW1pLWdhcFxcXFxhcHBzXFxcXHdlYlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcY2Fwc3RvbmVfMjZcXFxcbHVtaS1nYXBcXFxcYXBwc1xcXFx3ZWJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L2NhcHN0b25lXzI2L2x1bWktZ2FwL2FwcHMvd2ViL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcclxuICBidWlsZDoge1xyXG4gICAgbWFuaWZlc3Q6IHRydWUsXHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDYwMCxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XHJcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkSWQgPSBpZC5yZXBsYWNlKC9cXFxcL2csIFwiL1wiKTtcclxuICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuZW5kc1dpdGgoXCIvc3JjL2kxOG4vbG9jYWxlcy9lbi50c1wiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJpMThuLWVuXCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAobm9ybWFsaXplZElkLmVuZHNXaXRoKFwiL3NyYy9pMThuL2xvY2FsZXMvbmV3LXVpLnRzXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcImkxOG4tbmV3LXVpXCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoIW5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlc1wiKSkgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC9cIikgfHxcclxuICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC1kb20vXCIpIHx8XHJcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvcmVhY3Qtcm91dGVyLWRvbS9cIilcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItcmVhY3RcIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL0ByYWRpeC11aS9cIikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLXJhZGl4XCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAobm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9AdGFuc3RhY2svXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1xdWVyeVwiO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gTGV0IFJvbGx1cCBzcGxpdCBpY29ucyBieSBhY3R1YWwgcm91dGUgdXNhZ2UuIE9uZSBnbG9iYWwgaWNvbiBjaHVua1xyXG4gICAgICAgICAgLy8gcHVsbHMgZXZlcnkgbGF6eSBzY3JlZW4ncyBpY29ucyBpbnRvIHRoZSBpbml0aWFsIGFwcGxpY2F0aW9uIGdyYXBoLlxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3JlYWN0LW1hcmtkb3duL1wiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3JlbWFyay1nZm0vXCIpIHx8XHJcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvbWljcm9tYXJrXCIpIHx8XHJcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvbWRhc3RcIikgfHxcclxuICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy91bmlzdFwiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL2hhc3RcIilcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItbWFya2Rvd25cIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3RocmVlL1wiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItdGhyZWVcIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3JlYWN0LWhvb2stZm9ybS9cIikgfHwgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy96b2QvXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1mb3Jtc1wiO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL2F4aW9zL1wiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3p1c3RhbmQvXCIpIHx8XHJcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvc29ubmVyL1wiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL2NsYXNzLXZhcmlhbmNlLWF1dGhvcml0eS9cIikgfHxcclxuICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9jbHN4L1wiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3RhaWx3aW5kLW1lcmdlL1wiKSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL25leHQtdGhlbWVzL1wiKVxyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1hcHBcIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDMwMDAsXHJcbiAgICBwcm94eToge1xyXG4gICAgICAvLyBPcHRpb25hbDogcHJveHkgL2FwaSBkdXJpbmcgZGV2IHNvIGNvb2tpZXMgd29yayB3aXRob3V0IENPUlMuXHJcbiAgICAgIC8vIFJlbW92ZSBpZiB5b3UgcHJlZmVyIGhpdHRpbmcgdGhlIGJhY2tlbmQgZGlyZWN0bHkgdmlhIFZJVEVfQVBJX0JBU0UuXHJcbiAgICAgIFwiL2FwaVwiOiB7XHJcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6NDAwMFwiLFxyXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNFIsU0FBUyxvQkFBb0I7QUFDelQsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsT0FBTztBQUFBLElBQ0wsVUFBVTtBQUFBLElBQ1YsdUJBQXVCO0FBQUEsSUFDdkIsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sYUFBYSxJQUFJO0FBQ2YsZ0JBQU0sZUFBZSxHQUFHLFFBQVEsT0FBTyxHQUFHO0FBQzFDLGNBQUksYUFBYSxTQUFTLHlCQUF5QixHQUFHO0FBQ3BELG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksYUFBYSxTQUFTLDZCQUE2QixHQUFHO0FBQ3hELG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksQ0FBQyxhQUFhLFNBQVMsY0FBYyxFQUFHLFFBQU87QUFDbkQsY0FDRSxhQUFhLFNBQVMsc0JBQXNCLEtBQzVDLGFBQWEsU0FBUywwQkFBMEIsS0FDaEQsYUFBYSxTQUFTLGlDQUFpQyxHQUN2RDtBQUNBLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksYUFBYSxTQUFTLDBCQUEwQixHQUFHO0FBQ3JELG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksYUFBYSxTQUFTLDBCQUEwQixHQUFHO0FBQ3JELG1CQUFPO0FBQUEsVUFDVDtBQUdBLGNBQ0UsYUFBYSxTQUFTLCtCQUErQixLQUNyRCxhQUFhLFNBQVMsMkJBQTJCLEtBQ2pELGFBQWEsU0FBUyx5QkFBeUIsS0FDL0MsYUFBYSxTQUFTLHFCQUFxQixLQUMzQyxhQUFhLFNBQVMscUJBQXFCLEtBQzNDLGFBQWEsU0FBUyxvQkFBb0IsR0FDMUM7QUFDQSxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLGFBQWEsU0FBUyxzQkFBc0IsR0FBRztBQUNqRCxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLGFBQWEsU0FBUyxnQ0FBZ0MsS0FBSyxhQUFhLFNBQVMsb0JBQW9CLEdBQUc7QUFDMUcsbUJBQU87QUFBQSxVQUNUO0FBQ0EsY0FDRSxhQUFhLFNBQVMsc0JBQXNCLEtBQzVDLGFBQWEsU0FBUyx3QkFBd0IsS0FDOUMsYUFBYSxTQUFTLHVCQUF1QixLQUM3QyxhQUFhLFNBQVMseUNBQXlDLEtBQy9ELGFBQWEsU0FBUyxxQkFBcUIsS0FDM0MsYUFBYSxTQUFTLCtCQUErQixLQUNyRCxhQUFhLFNBQVMsNEJBQTRCLEdBQ2xEO0FBQ0EsbUJBQU87QUFBQSxVQUNUO0FBQ0EsaUJBQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUE7QUFBQTtBQUFBLE1BR0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
