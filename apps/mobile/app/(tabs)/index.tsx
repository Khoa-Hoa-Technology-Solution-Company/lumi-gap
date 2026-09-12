import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useQuery } from "@tanstack/react-query";
import type { Paper, ScoredPaper, TrendingTopic } from "@trend/shared-types";

import { useCreateBookmark, useDeleteBookmark, useBookmarkStatus } from "@/features/bookmarks";
import { usePapers } from "@/features/papers";
import { useSearch } from "@/features/search";
import { useTrendsOverview } from "@/features/trends";
import { useAuthStore } from "@/stores/auth-store";
import { LEVEL_IMAGES, getLevel } from "@/features/rankings";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

const HOME_MENU_ACTIONS = [
  { label: "Submit Paper", icon: "upload-cloud", route: "/submit-paper", color: "#06B6D4" },
  { label: "AI Reports", icon: "file-text", route: "/reports", color: "#A78BFA" },
  { label: "Ranks", icon: "award", route: "/rankings", color: "#A5B4FC" },
  { label: "Trends", icon: "trending-up", route: "/trends", color: "#22C55E" },
  { label: "Gaps", icon: "zap", route: "/gaps", color: "#F59E0B" },
  { label: "Projects", icon: "folder", route: "/projects", color: "#06B6D4" },
  { label: "My Papers", icon: "archive", route: "/my-papers", color: "#38BDF8" },
] as const satisfies ReadonlyArray<{
  label: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  color: string;
}>;

function Sparkline({ points }: { points: { year: number; count: number }[] }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <View className="flex-row items-end h-8 gap-1 mt-3">
      {points.slice(-7).map((point) => (
        <View
          key={point.year}
          className="flex-1 rounded-sm bg-[#8B5CF6]"
          style={{ height: Math.max(8, (point.count / max) * 32), opacity: 0.35 + (point.count / max) * 0.55 }}
        />
      ))}
    </View>
  );
}

function PaperCard({ paper }: { paper: Paper | ScoredPaper }) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const statusQuery = useBookmarkStatus("paper", paper.id);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const isBookmarked = statusQuery.data?.bookmarked;

  const toggleBookmark = () => {
    if (isBookmarked && statusQuery.data?.bookmarkId) {
      deleteBookmark.mutate(statusQuery.data.bookmarkId);
      return;
    }

    createBookmark.mutate(
      { targetKind: "paper", targetId: paper.id },
      {
        onError: (error: any) => {
          if (error?.response?.status !== 409) Alert.alert("Bookmark failed", error?.response?.data?.error?.message ?? "Please try again.");
        },
      },
    );
  };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/paper/${paper.id}` as any)}
      className="bg-card dark:bg-[#1A2332] rounded-2xl p-4 mb-3 border border-border dark:border-[#26334A]"
      activeOpacity={0.88}
    >
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-sm leading-5" numberOfLines={2}>
            {paper.title}
          </Text>
          <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs mt-1" numberOfLines={1}>
            {paper.authors?.map((a) => a.displayName).join(", ") || "Unknown authors"}
          </Text>
        </View>
        <TouchableOpacity onPress={toggleBookmark} className="pl-3 py-1" disabled={createBookmark.isPending || deleteBookmark.isPending}>
          <Feather name="bookmark" size={18} color={isBookmarked ? "#06B6D4" : isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Text className="flex-1 text-muted-foreground dark:text-[#94A3B8] text-[11px]" numberOfLines={1}>
          {paper.journalName ? `${paper.journalName} - ` : ""}{paper.publicationYear} - {paper.citationCount ?? 0} cites
        </Text>
        <View className="shrink-0 rounded-md bg-cyan-50 dark:bg-[#083344] px-2 py-1 flex-row items-center">
          <Ionicons name="sparkles" color="#06B6D4" size={12} />
          <Text className="text-[#0891B2] dark:text-[#67E8F9] text-[11px] font-bold ml-1" numberOfLines={1}>
            {("score" in paper ? paper.score : paper.dataQualityScore).toFixed(2)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const userLevel = getLevel(user?.points ?? 0);
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const hasQuery = debouncedQuery.length > 0;
  const papersQuery = usePapers({ page: 1, pageSize: 5 });
  const searchResults = useSearch({ q: debouncedQuery, page: 1, pageSize: 5, rerank: false });
  const trendsQuery = useTrendsOverview({ limit: 4, minPapers: 1, sortBy: "momentum" });

  const statsQuery = useQuery({
    queryKey: ["analyticsSummary"],
    queryFn: async () => {
      const res = await api.get(API_ROUTES.analytics.summary);
      return res.data.data as { totalSearches: number; totalPapers: number; uniqueUsers: number };
    },
  });

  const papers = (hasQuery ? searchResults.data?.papers : papersQuery.data?.papers) ?? [];
  const papersLoading = hasQuery ? searchResults.isLoading : papersQuery.isLoading;
  const topics = trendsQuery.data?.topics ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 112 }}>
        <View className="flex-row justify-between items-center mb-5">
          <TouchableOpacity
            className="w-11 h-11 rounded-full bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] items-center justify-center mr-3"
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.8}
          >
            <Feather name="menu" size={20} color={isDark ? "#F8FAFC" : "#0F172A"} />
          </TouchableOpacity>
          <View className="flex-1 pr-4">
            <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC]">Hi, {user?.fullName?.split(" ")[0] || "Researcher"}</Text>
            <Text className="text-sm text-muted-foreground dark:text-[#94A3B8] mt-1">What are you researching today?</Text>
          </View>
          <View className="w-11 h-11 rounded-full bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] items-center justify-center p-1">
            <Image source={LEVEL_IMAGES[userLevel]} className="w-full h-full" resizeMode="contain" />
          </View>
        </View>

        <View className="mb-5 bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl p-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-[#0B2B45] items-center justify-center">
              <Ionicons name="stats-chart" color="#06B6D4" size={16} />
            </View>
            <View>
              <Text className="text-xs font-bold text-foreground dark:text-[#F8FAFC]">Database Status</Text>
              <Text className="text-[11px] text-muted-foreground dark:text-[#94A3B8] mt-0.5">
                {statsQuery.isLoading
                  ? "Loading metrics..."
                  : `${statsQuery.data?.totalPapers || 0} papers - ${statsQuery.data?.totalSearches || 0} searches - ${statsQuery.data?.uniqueUsers || 0} users`}
              </Text>
            </View>
          </View>
          {statsQuery.isLoading ? (
            <ActivityIndicator size="small" color="#06B6D4" />
          ) : (
            <View className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 border border-emerald-200 dark:border-emerald-900">
              <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Live</Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center bg-card dark:bg-[#1A2332] rounded-full px-4 h-12 mb-7 border border-border dark:border-[#26334A]">
          <Feather name="search" color={isDark ? "#94A3B8" : "#64748B"} size={18} />
          <TextInput
            className="flex-1 ml-3 text-foreground dark:text-[#F8FAFC]"
            placeholder="Search papers, authors, topics..."
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          <Feather name="sliders" color={isDark ? "#94A3B8" : "#64748B"} size={18} />
        </View>

        <View className="mb-7">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Trending topics</Text>
            <TouchableOpacity onPress={() => router.push("/trends" as any)}>
              <Text className="text-xs font-semibold text-[#06B6D4]">View all</Text>
            </TouchableOpacity>
          </View>

          {trendsQuery.isLoading ? (
            <View className="h-28 justify-center"><ActivityIndicator color="#06B6D4" /></View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 px-4">
              {topics.map((topic: TrendingTopic) => (
                <View key={topic.topic} className="w-44 bg-card dark:bg-[#1A2332] rounded-2xl p-4 mr-3 border border-border dark:border-[#26334A]">
                  <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-sm" numberOfLines={2}>{topic.topic}</Text>
                  <View className="flex-row items-center mt-2">
                    <Feather name={topic.momentum >= 0 ? "arrow-up-right" : "arrow-down-right"} color={topic.momentum >= 0 ? "#22C55E" : "#F59E0B"} size={13} />
                    <Text className="text-[#22C55E] text-[11px] font-bold ml-1">{Math.round(topic.growthRatePct)}% growth</Text>
                  </View>
                  <Sparkline points={topic.yearlyBreakdown} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View className="mb-7">
          <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC] mb-3">{hasQuery ? "Search results" : "Recent papers"}</Text>
          {papersLoading ? (
            <View className="py-16"><ActivityIndicator color="#06B6D4" /></View>
          ) : papers.length > 0 ? (
            papers.map((paper) => <PaperCard key={paper.id} paper={paper} />)
          ) : (
            <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8">
              <Text className="text-center text-sm text-muted-foreground dark:text-[#94A3B8]">No papers found.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View className="rounded-t-3xl bg-background dark:bg-[#0F1B2D] border-t border-border dark:border-[#26334A] p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Menu</Text>
              <TouchableOpacity className="p-2" onPress={() => setMenuOpen(false)}>
                <Feather name="x" size={20} color={isDark ? "#94A3B8" : "#64748B"} />
              </TouchableOpacity>
            </View>
            {HOME_MENU_ACTIONS.map((item) => (
              <TouchableOpacity
                key={item.label}
                className="flex-row items-center py-4 border-b border-border dark:border-[#26334A]"
                onPress={() => {
                  setMenuOpen(false);
                  router.push(item.route as any);
                }}
                activeOpacity={0.8}
              >
                <View className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-[#083344] items-center justify-center mr-3">
                  <Feather name={item.icon} size={17} color={item.color} />
                </View>
                <Text className="flex-1 font-semibold text-foreground dark:text-[#F8FAFC]">{item.label}</Text>
                <Feather name="chevron-right" size={18} color={isDark ? "#64748B" : "#94A3B8"} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
