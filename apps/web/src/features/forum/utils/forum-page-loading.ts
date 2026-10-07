// Share the same import with React.lazy; hovering never fetches a post or logs a view.
export const loadForumDetailPage = () => import("@/pages/forum/forum-detail").then((module) => ({ default: module.ForumDetailPage }));

export function preloadForumDetailPage() {
  void loadForumDetailPage().catch(() => {
    // A failed preload can be retried by the normal route loader on navigation.
  });
}
