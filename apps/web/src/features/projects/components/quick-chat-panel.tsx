import { useNavigate } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { useI18n } from "@/i18n";
import { useQuickChatStore } from "../stores/quick-chat-store";
import { useProjectTeamChatUnread } from "../hooks/use-project-team-chat-unread";
import { ProjectTeamChatPanel } from "./project-team-chat-panel";
import "../quick-chat.css";

export function QuickChatTrigger({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const isOpen = useQuickChatStore((s) => s.isOpen && s.activeProjectId === projectId);
  const toggleChat = useQuickChatStore((s) => s.toggleChat);
  const { unreadCount, hasUnread } = useProjectTeamChatUnread(projectId);

  const label = t("Trò chuyện nhóm");
  const unreadLabel = hasUnread
    ? t("{{count}} tin nhắn chưa đọc", { count: unreadCount > 99 ? "99+" : unreadCount })
    : undefined;

  return (
    <button
      type="button"
      className="quick-chat-trigger-btn"
      aria-expanded={isOpen}
      aria-label={unreadLabel ? `${label} (${unreadLabel})` : label}
      title={unreadLabel ? `${label} · ${unreadLabel}` : label}
      onClick={() => toggleChat(projectId)}
    >
      <MessagesSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{label}</span>
      {hasUnread && (
        <span className="quick-chat-unread-badge" aria-hidden="true">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

export function QuickChatPanel({
  projectId,
  ownerId,
}: {
  projectId: string;
  ownerId?: string;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const closeChat = useQuickChatStore((s) => s.closeChat);
  const pendingReference = useQuickChatStore((s) => s.pendingReference);
  const clearPendingReference = useQuickChatStore((s) => s.clearPendingReference);

  const handleExpandFullScreen = () => {
    navigate(`/projects/${projectId}?tab=chat`);
  };

  return (
    <aside
      className="project-quick-chat-dock"
      role="complementary"
      aria-label={t("Trò chuyện nhóm")}
    >
      <ProjectTeamChatPanel
        projectId={projectId}
        ownerId={ownerId}
        compact
        initialReference={pendingReference ?? undefined}
        onReferenceConsumed={clearPendingReference}
        onExpandFullScreen={handleExpandFullScreen}
        onClose={closeChat}
      />
    </aside>
  );
}
