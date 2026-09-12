import { useState } from "react";
import { Users, Sparkles, Bot } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { ProjectTeamChatPanel } from "./project-team-chat-panel";
import { ProjectChatPanel } from "./project-chat-panel";

interface ProjectDiscussionPanelProps {
  projectId: string;
  paperCount: number;
  ownerId?: string;
}

type ChatMode = "team-chat" | "private-ai" | "team-ai";

export function ProjectDiscussionPanel({
  projectId,
  paperCount,
  ownerId,
}: ProjectDiscussionPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [activeMode, setActiveMode] = useState<ChatMode>("team-chat");
  const [aiDraft, setAiDraft] = useState("");

  const currentUserName =
    currentUser?.fullName || currentUser?.email || "You";

  return (
    <div className="space-y-4">
      {/* Compact Channel Switcher */}
      <div
        className="inline-flex self-start rounded-xl border border-slate-200/40 bg-slate-100/80 p-1 gap-1.5 dark:border-white/5 dark:bg-zinc-800/60"
        role="tablist"
        aria-label="Project discussion channels"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "team-chat"}
          onClick={() => setActiveMode("team-chat")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeMode === "team-chat"
              ? "bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-white/5"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team Chat</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "private-ai"}
          onClick={() => setActiveMode("private-ai")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeMode === "private-ai"
              ? "bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-white/5"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>My AI</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "team-ai"}
          onClick={() => setActiveMode("team-ai")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeMode === "team-ai"
              ? "bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-white/5"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Team AI Room</span>
        </button>
      </div>

      {/* Render selected chat panel */}
      {activeMode === "team-chat" && (
        <ProjectTeamChatPanel projectId={projectId} ownerId={ownerId} />
      )}
      {activeMode === "private-ai" && (
        <ProjectChatPanel
          projectId={projectId}
          paperCount={paperCount}
          currentUserName={currentUserName}
          scope="private"
          draft={aiDraft}
          onDraftChange={setAiDraft}
          onSwitchToTeamAI={() => setActiveMode("team-ai")}
        />
      )}
      {activeMode === "team-ai" && (
        <ProjectChatPanel
          projectId={projectId}
          paperCount={paperCount}
          currentUserName={currentUserName}
          scope="team"
          draft={aiDraft}
          onDraftChange={setAiDraft}
        />
      )}
    </div>
  );
}
