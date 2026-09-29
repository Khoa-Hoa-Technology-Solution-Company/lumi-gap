import { Bell, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useMarkNotificationRead } from "../hooks/use-notifications";
import { getNotificationDestination } from "../utils/notification-destination";

function formatNotificationTime(createdAt: string) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(createdAt).toLocaleDateString();
}

export default function NotificationMenu({ notifications, isLoading, unreadCount, isAdmin }: { notifications?: NotificationItem[]; isLoading: boolean; unreadCount: number; isAdmin: boolean }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const markRead = useMarkNotificationRead();
  const recent = notifications?.slice(0, 5) ?? [];

  const openNotification = (notification: NotificationItem) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    const destination = getNotificationDestination(notification, isAdmin);
    if (destination) navigate(destination);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-400" aria-label={t("Notifications")}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0f0f11]">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <DropdownMenuLabel className="p-0 text-sm font-bold">{t("Notifications")}</DropdownMenuLabel>
          {unreadCount > 0 && <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">{unreadCount} {t("unread")}</span>}
        </div>
        <div className="max-h-[24rem] overflow-y-auto p-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Loading notifications...")}</div>
          ) : recent.length === 0 ? (
            <div className="px-6 py-10 text-center"><Bell className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{t("No notifications yet")}</p><p className="mt-1 text-xs text-slate-500">{t("Updates about your research activity will appear here.")}</p></div>
          ) : recent.map((notification) => (
            <DropdownMenuItem key={notification.id} onSelect={() => openNotification(notification)} className={cn("block cursor-pointer rounded-lg px-3 py-3", !notification.isRead && "bg-blue-50/80 dark:bg-blue-950/20")}>
              <div className="flex items-start gap-3"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", notification.isRead ? "bg-slate-200 dark:bg-slate-700" : "bg-blue-600")} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{notification.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.message}</p><p className="mt-1.5 text-[10px] font-medium text-slate-400">{formatNotificationTime(notification.createdAt)}</p></div></div>
            </DropdownMenuItem>
          ))}
        </div>
        <div className="border-t border-slate-100 p-2 dark:border-slate-800"><Button variant="ghost" size="sm" className="w-full justify-center font-semibold text-blue-700 dark:text-blue-400" onClick={() => navigate("/notifications")}>{t("View all notifications")}</Button></div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
