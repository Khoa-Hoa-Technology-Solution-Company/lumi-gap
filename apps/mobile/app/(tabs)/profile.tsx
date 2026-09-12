import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";

import { useCurrentUser, useLogout } from "@/features/auth";
import { useBookmarks } from "@/features/bookmarks";
import { useReports } from "@/features/reports";
import { useAuthStore } from "@/stores/auth-store";
import { LEVEL_IMAGES, getLevel } from "@/features/rankings";

function SettingsRow({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const content = (
    <>
      <Feather name={icon} size={19} color={danger ? "#EF4444" : isDark ? "#94A3B8" : "#64748B"} />
      <Text className={`flex-1 ml-3 font-medium ${danger ? "text-[#EF4444]" : "text-foreground dark:text-[#F8FAFC]"}`}>{label}</Text>
      {value ? <Text className="text-muted-foreground dark:text-[#94A3B8] mr-2 text-sm">{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={19} color={isDark ? "#64748B" : "#94A3B8"} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View className="flex-row items-center p-4 border-b border-border dark:border-[#26334A] last:border-b-0">
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      className="flex-row items-center p-4 border-b border-border dark:border-[#26334A] last:border-b-0"
      activeOpacity={0.8}
      onPress={onPress}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const fallbackUser = useAuthStore((s) => s.user);
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const userQuery = useCurrentUser();
  const bookmarksQuery = useBookmarks();
  const reportsQuery = useReports({ page: 1, pageSize: 1 });
  const logoutMutation = useLogout();
  const user = userQuery.data?.user ?? fallbackUser;
  const userLevel = getLevel(user?.points ?? 0);
  const bookmarks = bookmarksQuery.data ?? [];
  const reportTotal = reportsQuery.data?.meta?.total ?? reportsQuery.data?.reports.length ?? 0;
  const topicCount = new Set(bookmarks.flatMap((bookmark) => bookmark.paperDetail?.topics?.map((topic) => topic.topicName) ?? [])).size;

  const handleLogout = () => {
    Alert.alert("Sign out", "Do you want to sign out of Publication Trend?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        // Don't clear the store first — useLogout reads the refresh token from the
        // store inside its mutationFn to revoke it server-side, then clears in onSettled.
        // Pre-clearing wiped the token so the server session was never revoked (lived 7d).
        onPress: () => logoutMutation.mutate(),
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 112 }}>
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC]">Profile</Text>
        </View>

        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-card dark:bg-[#111C2E] border border-[#06B6D4] items-center justify-center mb-3 p-2">
            <Image source={LEVEL_IMAGES[userLevel]} className="w-full h-full" resizeMode="contain" />
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC] mb-1">{user?.fullName ?? "Researcher"}</Text>
          <View className="bg-cyan-50 dark:bg-[#083344] px-3 py-1 rounded-full mb-2">
            <Text className="text-[#0891B2] dark:text-[#67E8F9] text-xs font-semibold">{user?.role ?? "researcher"}</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="school-outline" size={14} color={isDark ? "#94A3B8" : "#64748B"} />
            <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm ml-1">{user?.institution ?? "FPT University"}</Text>
          </View>
        </View>

        <View className="flex-row justify-between mb-8 gap-3">
          <View className="flex-1 bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl py-3 items-center">
            <Text className="text-xl font-bold text-foreground dark:text-[#F8FAFC]">{bookmarks.length}</Text>
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] mt-1">Bookmarks</Text>
          </View>
          <View className="flex-1 bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl py-3 items-center">
            <Text className="text-xl font-bold text-foreground dark:text-[#F8FAFC]">{topicCount}</Text>
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] mt-1">Topics</Text>
          </View>
          <View className="flex-1 bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl py-3 items-center">
            <Text className="text-xl font-bold text-foreground dark:text-[#F8FAFC]">{reportTotal}</Text>
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] mt-1">Reports</Text>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-xs font-bold text-muted-foreground dark:text-[#94A3B8] uppercase mb-2 ml-1">Activity</Text>
          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl overflow-hidden">
            <SettingsRow icon="upload-cloud" label="Submit Paper" onPress={() => router.push("/submit-paper" as any)} />
            <SettingsRow icon="file-text" label="My Papers" onPress={() => router.push("/my-papers" as any)} />
            <SettingsRow icon="folder" label="Projects" onPress={() => router.push("/projects" as any)} />
            <SettingsRow icon="award" label="Rankings" onPress={() => router.push("/rankings" as any)} />
            <SettingsRow icon="bell" label="Notifications" onPress={() => router.push("/notifications" as any)} />
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-xs font-bold text-muted-foreground dark:text-[#94A3B8] uppercase mb-2 ml-1">Appearance</Text>
          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl overflow-hidden">
            <SettingsRow icon={isDark ? "moon" : "sun"} label="Theme" value={isDark ? "Dark" : "Light"} onPress={toggleColorScheme} />
            <SettingsRow icon="type" label="Font size" value="Default" />
          </View>
        </View>

        <TouchableOpacity
          className="w-full bg-transparent border border-[#EF4444] rounded-xl py-4 flex-row items-center justify-center"
          onPress={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <Text className="text-[#EF4444] text-base font-bold">Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
