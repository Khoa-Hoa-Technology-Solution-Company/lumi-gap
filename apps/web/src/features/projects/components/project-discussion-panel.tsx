import { useState } from "react";
import { Users, Sparkles, Bot } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { ProjectTeamChatPanel } from "./project-team-chat-panel";
import { ProjectChatPanel } from "./project-chat-panel";

interface ProjectDiscussionPanelProps {
  projectId: string;
  paperCount: number;
  ownerId?: string;
  onAddPapers?: () => void;
}

type ChatMode = "team-chat" | "private-ai" | "team-ai";

export function ProjectDiscussionPanel({
  projectId,
  paperCount,
  ownerId,
  onAddPapers,
}: ProjectDiscussionPanelProps) {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.user);
  const [activeMode, setActiveMode] = useState<ChatMode>("team-chat");
  const [aiDraft, setAiDraft] = useState("");

  const currentUserName =
    currentUser?.fullName || currentUser?.email || "You";

  const channels = [
    {
      id: "team-chat" as const,
      label: t("Team Chat"),
      subtitle: t("Internal member discussion"),
      icon: Users,
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      activeRing: "ring-blue-500/20 border-blue-500/40 dark:border-blue-500/30",
    },
    {
      id: "private-ai" as const,
      label: t("My AI"),
      subtitle: t("Private research copilot"),
      icon: Sparkles,
      badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      activeRing: "ring-purple-500/20 border-purple-500/40 dark:border-purple-500/30",
    },
    {
      id: "team-ai" as const,
      label: t("Team AI Room"),
      subtitle: t("Shared project memory & findings"),
      icon: Bot,
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      activeRing: "ring-amber-500/20 border-amber-500/40 dark:border-amber-500/30",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Smart Channel Hub */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-1.5 rounded-2xl border border-border/70 bg-muted/30 backdrop-blur-xs"
        role="tablist"
        aria-label={t("Project discussion channels")}
      >
        {channels.map((chan) => {
          const Icon = chan.icon;
          const isActive = activeMode === chan.id;
          return (
            <button
              key={chan.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveMode(chan.id)}
              className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all relative ${
                isActive
                  ? `bg-background text-foreground shadow-sm border ${chan.activeRing} ring-2`
                  : "hover:bg-background/60 text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isActive ? "bg-primary text-primary-foreground shadow-xs" : chan.badgeColor
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className={`text-xs font-bold truncate ${isActive ? "text-foreground" : "text-foreground/80"}`}>
                    {chan.label}
                  </span>
                  {isActive && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                  {chan.subtitle}
                </p>
              </div>
            </button>
          );
        })}
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
          onAddPapers={onAddPapers}
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
          onAddPapers={onAddPapers}
          draft={aiDraft}
          onDraftChange={setAiDraft}
        />
      )}
    </div>
  );
}
