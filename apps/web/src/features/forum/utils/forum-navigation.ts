import { Bell, Clock3, MessageSquare, TrendingUp } from "lucide-react";
import type { ForumSort } from "@trend/shared-types";

// One vocabulary for the sidebar and topic-list navigation.
export const FORUM_FEEDS: Array<{ value: ForumSort; label: string; description: string; icon: typeof Bell }> = [
  { value: "latest", label: "Latest", description: "Recent discussion activity; pinned threads stay first.", icon: Clock3 },
  { value: "unanswered", label: "Unanswered", description: "Threads with no visible replies yet, across all thread types.", icon: MessageSquare },
  { value: "popular", label: "Popular", description: "Community activity ranked by Helpful, replies and recency—not research validity.", icon: TrendingUp },
  { value: "following", label: "Following", description: "Discussions you chose to follow.", icon: Bell },
];
