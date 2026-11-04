import { Bell, Clock3, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import type { ForumSort } from "@trend/shared-types";

/** Web-only: "for-you" is a personalised feed, never a sort of the forum list API (ForumSort is unchanged). */
export type ForumFeed = ForumSort | "for-you";

/** "For you" is platform-wide, so its link carries no other filter. */
export const FOR_YOU_FEED_HREF = "/forum?feed=for-you";

// One vocabulary for the sidebar and topic-list navigation.
export const FORUM_FEEDS: Array<{ value: ForumFeed; label: string; description: string; icon: typeof Bell }> = [
  { value: "latest", label: "Latest", description: "Recent discussion activity; pinned threads stay first.", icon: Clock3 },
  { value: "for-you", label: "For you", description: "Unread discussions picked from your interests and the communities you joined.", icon: Sparkles },
  { value: "unanswered", label: "Unanswered", description: "Threads with no visible replies yet, across all thread types.", icon: MessageSquare },
  { value: "popular", label: "Popular", description: "Community activity ranked by Helpful, replies and recency—not research validity.", icon: TrendingUp },
  { value: "following", label: "Following", description: "Discussions you chose to follow.", icon: Bell },
];
