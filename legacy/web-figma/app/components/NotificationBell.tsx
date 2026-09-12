import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronDown, Circle, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { AppNotification, getMyNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../lib/notifications';
import { disconnectNotificationSocket, getNotificationSocket } from '../lib/socket';
import { getStoredUser, getToken } from '../lib/api';

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function NotificationBell() {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refreshNotifications = async () => {
    try {
      const data = await getMyNotifications(10);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (_error) {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const token = getToken();

    if (!token) {
      setIsLoading(false);
      return;
    }

    const socket = getNotificationSocket(token);
    const handleNotification = () => {
      if (isMounted) {
        refreshNotifications();
      }
    };

    socket.on('notification:new', handleNotification);
    refreshNotifications();

    return () => {
      isMounted = false;
      socket.off('notification:new', handleNotification);
      disconnectNotificationSocket();
    };
  }, []);

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  };

  const handleOpenNotification = async (notification: AppNotification) => {
    if (!notification.isRead) {
      await markNotificationAsRead(notification._id);
      setNotifications((prev) =>
        prev.map((item) => (item._id === notification._id ? { ...item, isRead: true } : item))
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    }

    if (notification.paper?._id) {
      navigate(`/paper/${notification.paper._id}`);
    }

    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm transition-colors hover:bg-accent"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {currentUser?.role === 'admin' ? 'Admin updates' : 'Latest paper updates'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline disabled:text-muted-foreground"
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-6 text-sm text-muted-foreground">Loading notifications...</div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground">No notifications yet.</div>
            )}

            {notifications.map((notification) => (
              <button
                key={notification._id}
                onClick={() => handleOpenNotification(notification)}
                className={`flex w-full gap-3 border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-accent ${
                  notification.isRead ? 'bg-white' : 'bg-blue-50/60'
                }`}
              >
                <div className="mt-1 flex-shrink-0">
                  {notification.isRead ? (
                    <CheckCheck size={16} className="text-muted-foreground" />
                  ) : (
                    <Circle size={10} className="fill-blue-600 text-blue-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-foreground">{notification.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                    </div>
                    <ChevronDown size={14} className="mt-1 rotate-[-90deg] text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{formatTime(notification.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
