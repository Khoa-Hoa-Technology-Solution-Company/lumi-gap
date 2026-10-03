import type { ForumReactionName } from "../api/forum.api";

export const FORUM_REACTIONS: Array<{ value: ForumReactionName; emoji: string; label: string }> = [
  { value: "LIKE", emoji: "❤️", label: "Like" },
  { value: "INSIGHTFUL", emoji: "💡", label: "Insightful" },
  { value: "CELEBRATE", emoji: "🎉", label: "Celebrate" },
  { value: "CURIOUS", emoji: "🤔", label: "Curious" },
  { value: "LOVE", emoji: "🥰", label: "Love" },
  { value: "LAUGH", emoji: "😂", label: "Laugh" },
  { value: "SURPRISED", emoji: "😮", label: "Surprised" },
  { value: "SAD", emoji: "😢", label: "Sad" },
  { value: "AGREE", emoji: "👍", label: "Agree" },
  { value: "DISAGREE", emoji: "👎", label: "Disagree" },
];
