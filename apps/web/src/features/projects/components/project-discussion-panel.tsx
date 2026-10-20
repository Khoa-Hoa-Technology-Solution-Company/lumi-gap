import { useId, useState } from "react";
import { Users, Sparkles, Bot, LockKeyhole } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { ProjectTeamChatPanel } from "./project-team-chat-panel";
import { ProjectChatPanel } from "./project-chat-panel";
import "../project-chat.css";

interface ProjectDiscussionPanelProps {
  projectId: string;
  paperCount: number;
  ownerId?: string;
  onAddPapers?: () => void;
}

type ChatMode = "team-chat" | "private-ai" | "team-ai";

export function ProjectDiscussionPanel(props: ProjectDiscussionPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  return <DiscussionChannels key={`${props.projectId}:${currentUser?.id}`} {...props} />;
}

function DiscussionChannels({ projectId, paperCount, ownerId, onAddPapers }: ProjectDiscussionPanelProps) {
  const { t } = useI18n();
  const id = useId();
  const currentUser = useAuthStore((s) => s.user);
  const [activeMode, setActiveMode] = useState<ChatMode>("team-chat");
  const [drafts, setDrafts] = useState<Record<ChatMode, string>>({ "team-chat": "", "private-ai": "", "team-ai": "" });
  const setDraft = (mode: ChatMode, value: string) => setDrafts(current => ({ ...current, [mode]: value }));
  const channels = [
    { id: "team-chat" as const, label: t("Team Chat"), icon: Users },
    { id: "private-ai" as const, label: t("My AI"), icon: Sparkles },
    { id: "team-ai" as const, label: t("Team AI Room"), icon: Bot },
  ];

  return (
    <div className="project-conversation">
      <div className="project-chat-channels" role="tablist" aria-label={t("Project discussion channels")}>
        {channels.map((channel, index) => {
          const Icon = channel.icon;
          return <button
            key={channel.id}
            id={`${id}-${channel.id}`}
            type="button"
            role="tab"
            aria-selected={activeMode === channel.id}
            aria-controls={`${id}-panel`}
            tabIndex={activeMode === channel.id ? 0 : -1}
            onClick={() => setActiveMode(channel.id)}
            onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % channels.length
                : event.key === "ArrowLeft" ? (index + channels.length - 1) % channels.length
                : event.key === "Home" ? 0 : event.key === "End" ? channels.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              setActiveMode(channels[next]!.id);
              document.getElementById(`${id}-${channels[next]!.id}`)?.focus();
            }}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{channel.label}</span>
            {channel.id === "private-ai" && <LockKeyhole size={12} aria-label={t("Private")} className="project-chat-private-icon" />}
          </button>;
        })}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${activeMode}`} key={activeMode}>
        {activeMode === "team-chat" ? <ProjectTeamChatPanel projectId={projectId} ownerId={ownerId} draft={drafts[activeMode]} onDraftChange={value => setDraft(activeMode, value)} /> : (
          <ProjectChatPanel
            projectId={projectId}
            paperCount={paperCount}
            currentUserName={currentUser?.fullName || currentUser?.email || t("You")}
            scope={activeMode === "private-ai" ? "private" : "team"}
            onAddPapers={onAddPapers}
            draft={drafts[activeMode]}
            onDraftChange={value => setDraft(activeMode, value)}
          />
        )}
      </div>
    </div>
  );
}
