import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, FileText, X, Bell, Loader2, CheckCircle2, AlertCircle, Sparkles, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/features/notifications";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const { data: notifications, isLoading } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const [activeTab, setActiveTab] = useState<"all" | "papers" | "system">("all");

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast.success("Marked all as read.");
    } catch {
      toast.error("Failed to mark as read.");
    }
  };

  const handleNotificationClick = async (
    id: string, 
    isRead: boolean, 
    targetKind: string | null, 
    targetId: string | null,
    type: string
  ) => {
    if (!isRead) {
      try {
        await markReadMutation.mutateAsync(id);
      } catch (err) {
        console.error("Failed to mark read:", err);
      }
    }

    if (type === "level_up") {
      navigate("/rankings");
      return;
    }

    if (isAdmin && type === "submission_pending") {
      navigate("/admin/papers");
      return;
    }

    if (!isAdmin && type === "submission_rejected" && targetKind === "paper" && targetId) {
      navigate(`/settings/submit-paper?edit=${targetId}`);
      return;
    }

    if (targetKind && targetId) {
      if (targetKind === "paper") navigate(`/papers/${targetId}`);
      else if (targetKind === "report") navigate(`/reports/${targetId}`);
      else if (targetKind === "gap") navigate(`/gaps/${targetId}`);
      else if (targetKind === "project") navigate(`/projects/${targetId}`);
      return;
    }

    // Navigate based on role and notification type (legacy fallback)
    if (isAdmin) {
      navigate("/admin/papers");
    } else {
      navigate("/settings/my-papers");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Filter notifications
  const allItems = notifications || [];
  const filteredItems = allItems.filter((item) => {
    if (activeTab === "all") return true;
    if (activeTab === "papers") return item.type.startsWith("submission");
    if (activeTab === "system") return !item.type.startsWith("submission");
    return true;
  });

  const unreadCount = allItems.filter((n) => !n.isRead).length;
  const paperAlertsCount = allItems.filter((n) => n.type.startsWith("submission") && !n.isRead).length;
  const systemCount = allItems.filter((n) => !n.type.startsWith("submission") && !n.isRead).length;

  return (
    <main className="container py-8 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Left Sidebar */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col justify-between h-[calc(100vh-8rem)] sticky top-24">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6 px-4">
              Notifications
            </h1>
            
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("all")}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === "all"
                    ? "bg-blue-800 text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 shrink-0" />
                  All
                </div>
                {unreadCount > 0 && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === "all" ? "bg-white/20 text-white" : "bg-red-500 text-white"
                  }`}>
                    {unreadCount}
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab("papers")}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === "papers"
                    ? "bg-blue-800 text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 shrink-0" />
                  Paper Alerts
                </div>
                {paperAlertsCount > 0 && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === "papers" ? "bg-white/20 text-white" : "bg-red-500 text-white"
                  }`}>
                    {paperAlertsCount}
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab("system")}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === "system"
                    ? "bg-blue-800 text-white font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  System
                </div>
                {systemCount > 0 && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === "system" ? "bg-white/20 text-white" : "bg-red-500 text-white"
                  }`}>
                    {systemCount}
                  </div>
                )}
              </button>
            </nav>
          </div>
          
          <div className="mt-8">
            <div className="flex items-center gap-3 px-4 py-2.5 text-slate-400 font-medium text-xs">
              <Settings className="w-4 h-4 shrink-0" /> Notification settings enabled
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Activity</h2>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-bold text-blue-700 dark:text-blue-500 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl">
              <Bell className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No notifications found.</p>
              <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1">We will notify you here about updates.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item) => {
                const isApproved = item.type === "submission_approved";
                const isRejected = item.type === "submission_rejected";

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item.id, item.isRead, item.targetKind, item.targetId, item.type)}
                    className={`border rounded-xl p-5 relative cursor-pointer transition-all hover:border-slate-300 dark:hover:border-zinc-700 ${
                      item.isRead
                        ? "bg-white dark:bg-[#121212] border-slate-200 dark:border-slate-800"
                        : "bg-[#f0f4ff] dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50"
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border ${
                        isApproved
                          ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border-emerald-100 dark:border-emerald-900/30"
                          : isRejected
                          ? "bg-red-50 dark:bg-red-950/20 text-red-600 border-red-100 dark:border-red-900/30"
                          : "bg-blue-50 dark:bg-blue-950/20 text-blue-600 border-blue-100 dark:border-blue-900/30"
                      }`}>
                        {isApproved ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : isRejected ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-[15px] text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                          {!item.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                          )}
                        </div>
                        <p className="text-[14px] text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
                          {item.message}
                        </p>
                        <div className="text-[11px] font-medium text-slate-400">
                          {formatTime(item.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Code quality reviewed and formatted
