import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { TrendingTopic, YearlyCount } from "@trend/shared-types";

import { useTopicTrend, useTrendsOverview, type TrendsOverviewParams } from "@/features/trends";

type SortBy = NonNullable<TrendsOverviewParams["sortBy"]>;

function Bars({ points }: { points: YearlyCount[] }) {
  const visible = points.slice(-8);
  const max = Math.max(...visible.map((point) => point.count), 1);

  return (
    <View className="mt-4 flex-row items-end gap-1 h-20">
      {visible.map((point) => (
        <View key={point.year} className="flex-1 items-center">
          <View className="w-full rounded-t-md bg-[#06B6D4]" style={{ height: Math.max(8, (point.count / max) * 72) }} />
          <Text className="mt-1 text-[9px] text-muted-foreground dark:text-[#94A3B8]">{String(point.year).slice(2)}</Text>
        </View>
      ))}
    </View>
  );
}

function TopicRow({ topic, selected, onPress }: { topic: TrendingTopic; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      className={`mb-3 rounded-2xl border p-4 ${
        selected ? "border-[#06B6D4] bg-cyan-50 dark:bg-[#082F49]" : "border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{topic.topic}</Text>
          <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]">
            {topic.totalPapers} papers · momentum {topic.momentum.toFixed(2)}
          </Text>
        </View>
        <View className="rounded-full bg-emerald-500/15 px-2 py-1">
          <Text className="text-[11px] font-bold text-emerald-500">{Math.round(topic.growthRatePct)}%</Text>
        </View>
      </View>
      <Bars points={topic.yearlyBreakdown} />
    </TouchableOpacity>
  );
}

export default function TrendsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [sortBy, setSortBy] = useState<SortBy>("momentum");
  const overviewQuery = useTrendsOverview({ limit: 20, minPapers: 1, sortBy });
  const topics = overviewQuery.data?.topics ?? [];
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();
  const topicQuery = useTopicTrend(selectedTopic);

  useEffect(() => {
    if (!selectedTopic && topics.length > 0) setSelectedTopic(topics[0].topic);
  }, [selectedTopic, topics]);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Trends</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={overviewQuery.isRefetching} onRefresh={() => overviewQuery.refetch()} tintColor="#06B6D4" />}
      >
        <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC]">Publication Trends</Text>
        <Text className="mt-1 text-sm text-muted-foreground dark:text-[#94A3B8]">Test /trends and /trends/:topic from one screen.</Text>

        <View className="my-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3">
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Papers</Text>
            <Text className="mt-1 text-xl font-bold text-foreground dark:text-[#F8FAFC]">{overviewQuery.data?.totalPapersInWindow ?? "..."}</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3">
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Window</Text>
            <Text className="mt-1 text-xl font-bold text-foreground dark:text-[#F8FAFC]">
              {overviewQuery.data ? `${overviewQuery.data.yearFrom}-${overviewQuery.data.yearTo}` : "..."}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mb-5 px-4">
          {(["momentum", "growth", "total"] as SortBy[]).map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setSortBy(option)}
              className={`mr-2 rounded-full border px-4 py-2 ${
                sortBy === option ? "border-[#1D4ED8] bg-[#1D4ED8]" : "border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
              }`}
            >
              <Text className={`text-xs font-bold capitalize ${sortBy === option ? "text-white" : "text-muted-foreground dark:text-[#94A3B8]"}`}>{option}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {overviewQuery.isLoading ? (
          <View className="py-24"><ActivityIndicator color="#06B6D4" /></View>
        ) : overviewQuery.isError ? (
          <View className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <Text className="text-center text-sm font-semibold text-red-500">Could not load trends.</Text>
          </View>
        ) : (
          <>
            {topicQuery.data ? (
              <View className="mb-5 rounded-2xl border border-[#06B6D4] bg-cyan-50 dark:bg-[#082F49] p-4">
                <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{topicQuery.data.topic}</Text>
                <Text className="mt-1 text-xs text-muted-foreground dark:text-[#CFFAFE]">Detail API loaded · {topicQuery.data.totalPapers} papers</Text>
                <Bars points={topicQuery.data.yearlyBreakdown} />
              </View>
            ) : null}

            <Text className="mb-3 text-lg font-bold text-foreground dark:text-[#F8FAFC]">Topics</Text>
            {topics.map((topic) => (
              <TopicRow key={topic.topic} topic={topic} selected={selectedTopic === topic.topic} onPress={() => setSelectedTopic(topic.topic)} />
            ))}

            <Text className="mb-3 mt-3 text-lg font-bold text-foreground dark:text-[#F8FAFC]">Rising keywords</Text>
            {(overviewQuery.data?.risingKeywords ?? []).slice(0, 8).map((keyword) => (
              <TouchableOpacity
                key={keyword.keyword}
                className="mb-2 rounded-xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3"
                activeOpacity={0.86}
                onPress={() => router.push(`/keyword/${encodeURIComponent(keyword.keyword)}` as any)}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-bold text-foreground dark:text-[#F8FAFC]">{keyword.keyword}</Text>
                    <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]">
                      {keyword.totalPapers} papers · {Math.round(keyword.growthRatePct)}% growth
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={isDark ? "#64748B" : "#94A3B8"} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
