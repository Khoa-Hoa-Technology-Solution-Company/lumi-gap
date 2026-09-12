import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type AppNotification,
} from "@/features/notifications";

function iconFor(type: string): keyof typeof Feather.glyphMap {
  if (type.includes("approved")) return "check-circle";
  if (type.includes("rejected") || type.includes("failed")) return "x-circle";
  if (type.includes("report")) return "bar-chart-2";
  if (type.includes("level")) return "award";
  return "bell";
}

function relativeDate(value: string) {
  const time = new Date(value).getTime();
  const diffMs = Date.now() - time;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(value).toLocaleDateString();
}

function NotificationRow({ item }: { item: AppNotification }) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const markRead = useMarkNotificationRead();

  const open = () => {
    if (!item.isRead) markRead.mutate(item.id);

    if (item.targetKind === "paper" && item.targetId) {
      router.push(`/paper/${item.targetId}` as any);
    } else if (item.targetKind === "report" && item.targetId) {
      router.push(`/report/${item.targetId}` as any);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={open}
      className={`mb-3 rounded-2xl border p-4 ${
        item.isRead
          ? "border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
          : "border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-[#0B2B45]"
      }`}
    >
      <View className="flex-row items-start">
        <View className="mr-3 h-9 w-9 rounded-xl bg-white dark:bg-[#111C2E] items-center justify-center border border-border dark:border-[#26334A]">
          <Feather name={iconFor(item.type)} size={17} color="#06B6D4" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-sm font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>
              {item.title}
            </Text>
            {!item.isRead ? <View className="mt-1 h-2 w-2 rounded-full bg-[#06B6D4]" /> : null}
          </View>
          <Text className="mt-1 text-xs leading-5 text-muted-foreground dark:text-[#CBD5E1]" numberOfLines={3}>
            {item.message}
          </Text>
          <Text className="mt-2 text-[11px] font-semibold text-muted-foreground dark:text-[#94A3B8]">
            {relativeDate(item.createdAt)}
          </Text>
        </View>
        {item.targetKind === "paper" || item.targetKind === "report" ? (
          <Feather name="chevron-right" size={18} color={isDark ? "#64748B" : "#94A3B8"} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const notificationsQuery = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 112 }}
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => notificationsQuery.refetch()}
            tintColor="#06B6D4"
          />
        }
      >
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC]">Notifications</Text>
            <Text className="mt-1 text-sm text-muted-foreground dark:text-[#94A3B8]">
              {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "All caught up"}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <TouchableOpacity
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="rounded-full border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] px-3 py-2"
            >
              <Text className="text-xs font-bold text-[#06B6D4]">
                {markAllRead.isPending ? "Saving..." : "Mark all"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {notificationsQuery.isLoading ? (
          <View className="py-24 items-center">
            <ActivityIndicator color="#06B6D4" />
            <Text className="mt-3 text-sm text-muted-foreground dark:text-[#94A3B8]">Loading notifications...</Text>
          </View>
        ) : notifications.length > 0 ? (
          notifications.map((item) => <NotificationRow key={item.id} item={item} />)
        ) : (
          <View className="mt-8 rounded-2xl border border-dashed border-border dark:border-[#26334A] bg-card dark:bg-[#111C2E] p-10 items-center">
            <Ionicons name="notifications-outline" size={38} color={isDark ? "#64748B" : "#94A3B8"} />
            <Text className="mt-4 text-center text-base font-bold text-foreground dark:text-[#F8FAFC]">
              No notifications yet
            </Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground dark:text-[#94A3B8]">
              Paper approvals, reports, and account updates will show up here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
