import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Sparkles, Bot, LockKeyhole, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { ProjectTeamChatPanel } from "./project-team-chat-panel";
import { ProjectChatPanel } from "./project-chat-panel";
import "../project-chat.css";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { MentorAccessWorkspace } from "./mentor-access-workspace";

interface ProjectDiscussionPanelProps {
  projectId: string;
  paperCount: number;
  ownerId?: string;
  onAddPapers?: () => void;
}

type ChatMode = "team-chat" | "private-ai" | "team-ai";
type Channel = ChatMode | "mentors";

export function ProjectDiscussionPanel(props: ProjectDiscussionPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  return <DiscussionChannels key={`${props.projectId}:${currentUser?.id}`} {...props} />;
}

function DiscussionChannels({ projectId, paperCount, ownerId, onAddPapers }: ProjectDiscussionPanelProps) {
  const { t } = useI18n();
  const id = useId();
  const currentUser = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const requestedChannel = params.get("channel");
  const activeMode: Channel = ["private-ai", "team-ai", "mentors"].includes(requestedChannel ?? "") ? requestedChannel as Channel : "team-chat";
  useEffect(() => {
    document.getElementById(`${id}-${activeMode}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeMode, id]);
  const changeChannel = async (mode: Channel) => {
    if (activeMode === "mentors" && mode !== activeMode && !await canLeaveWorkspace()) return false;
    setParams(current => { const next = new URLSearchParams(current); next.set("channel", mode); return next; }, { replace: true });
    return true;
  };
  const [drafts, setDrafts] = useState<Record<ChatMode, string>>({ "team-chat": "", "private-ai": "", "team-ai": "" });
  useUnsavedWorkspace(Object.values(drafts).some(value => Boolean(value.trim())));
  const setDraft = (mode: ChatMode, value: string) => setDrafts(current => ({ ...current, [mode]: value }));
  const clearSentDraft = (mode: ChatMode, content: string) => setDrafts(current => current[mode].trim() === content ? { ...current, [mode]: "" } : current);
  const channels = [
    { id: "team-chat" as const, label: t("Team Chat"), icon: Users },
    { id: "private-ai" as const, label: t("My AI"), icon: Sparkles },
    { id: "team-ai" as const, label: t("Team AI Room"), icon: Bot },
    { id: "mentors" as const, label: t("With mentors"), icon: GraduationCap },
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
            onClick={() => void changeChannel(channel.id)}
            onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % channels.length
                : event.key === "ArrowLeft" ? (index + channels.length - 1) % channels.length
                : event.key === "Home" ? 0 : event.key === "End" ? channels.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              void changeChannel(channels[next]!.id).then(changed => { if (changed) document.getElementById(`${id}-${channels[next]!.id}`)?.focus(); });
            }}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{channel.label}</span>
            {channel.id === "private-ai" && <LockKeyhole size={12} aria-label={t("Private")} className="project-chat-private-icon" />}
          </button>;
        })}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${activeMode}`} key={activeMode}>
        {activeMode === "mentors" ? <div className="project-mentor-channel"><MentorAccessWorkspace projectId={projectId} mode="conversation" /></div> : activeMode === "team-chat" ? <ProjectTeamChatPanel projectId={projectId} ownerId={ownerId} draft={drafts[activeMode]} onDraftChange={value => setDraft(activeMode, value)} onSent={content => clearSentDraft("team-chat", content)} /> : (
          <ProjectChatPanel
            projectId={projectId}
            paperCount={paperCount}
            currentUserName={currentUser?.fullName || currentUser?.email || t("You")}
            scope={activeMode === "private-ai" ? "private" : "team"}
            onAddPapers={onAddPapers}
            draft={drafts[activeMode]}
            onDraftChange={value => setDraft(activeMode, value)}
            onSent={content => clearSentDraft(activeMode, content)}
          />
        )}
      </div>
    </div>
  );
}
