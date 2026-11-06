import { Link } from "react-router-dom";
import { MessageSquare, ArrowRight } from "lucide-react";
import { getNotificationDestination } from "@/features/notifications/utils/notification-destination";
import { useScreeningDiscussionUnread } from "../hooks/use-screening-discussion-unread";

export function ScreeningDiscussionUnread({ roundId }: { roundId: string }) {
  const unread = useScreeningDiscussionUnread(roundId);
  const destination = unread[0] && getNotificationDestination(unread[0], false);
  if (!unread.length || !destination) return null;
  return <Link to={destination} className="screening-discussion-unread-link">
    <MessageSquare size={14} aria-hidden="true" />
    <span>{unread.length} tin nhắn mới</span><ArrowRight size={13} aria-hidden="true" />
  </Link>;
}
