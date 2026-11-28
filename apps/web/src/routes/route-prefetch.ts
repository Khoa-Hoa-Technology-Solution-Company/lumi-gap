const prefetched = new Set<string>();

const ROUTE_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("@/pages/dashboard"),
  "/projects": () => import("@/pages/projects/projects-workspace"),
  "/literature": () => import("@/pages/literature"),
  "/profile": () => import("@/pages/profile-overview"),
  "/notifications": () => import("@/pages/notifications"),
  "/mentor-workspace": () => import("@/pages/academics/mentor-workspace"),
  "/reports": () => import("@/pages/reports/reports-list"),
  "/research-gaps": () => import("@/pages/research-gaps"),
  "/reviews": () => import("@/pages/reviews/review-dashboard"),
  "/review-templates": () => import("@/pages/reviews/review-templates"),
  "/trends": () => import("@/pages/trends"),
  "/forum": () => import("@/pages/forum/forum-list"),
};

/**
 * Prefetches ONLY the lazy JS chunk for high-frequency routes on hover/focus.
 * Never fires API calls or preloads PDFs/documents.
 */
export function prefetchRouteChunk(to: string): void {
  if (import.meta.env.MODE === "test") return;
  const path = to.split("?")[0]?.split("#")[0] ?? "";
  if (!path || prefetched.has(path)) return;
  const loader = ROUTE_CHUNK_LOADERS[path];
  if (!loader) return;
  prefetched.add(path);
  void loader().catch(() => {
    prefetched.delete(path);
  });
}
