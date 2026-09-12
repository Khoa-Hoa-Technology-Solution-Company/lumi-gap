import { useState, useEffect, useCallback, useMemo } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { GapSource, GapStatus, ResearchGapItem } from "@trend/shared-types";

import { useGaps, useAnalyzeGap, useGapAnalysisStatus, usePatchGapStatus } from "@/features/gaps";

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-emerald-500" : value >= 0.4 ? "bg-amber-500" : "bg-red-400";
  return (
    <View className="flex-row items-center gap-2">
      <View className="w-20 h-1.5 bg-muted dark:bg-[#26334A] rounded-full overflow-hidden">
        <View className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-[11px] font-bold text-muted-foreground dark:text-[#94A3B8]">{pct}% confidence</Text>
    </View>
  );
}

function GapCard({ gap, onStatusChange }: { gap: ResearchGapItem; onStatusChange: (id: string, status: "resolved" | "dismissed") => void }) {
  return (
    <View className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
      <View className="flex-row items-start justify-between gap-2 mb-2">
        <Text className="flex-1 text-sm font-bold text-foreground dark:text-[#F8FAFC] leading-5" numberOfLines={2}>
          {gap.title}
        </Text>
        <View className="rounded-md bg-muted dark:bg-[#26334A] px-2 py-0.5 shrink-0">
          <Text className="text-[10px] font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">{gap.source}</Text>
        </View>
      </View>
      <Text className="text-xs text-muted-foreground dark:text-[#CBD5E1] mb-2 leading-5">{gap.description}</Text>
      {gap.rationale ? (
        <Text className="text-xs text-slate-500 dark:text-[#94A3B8] italic mb-3 border-l-2 border-slate-300 dark:border-slate-700 pl-2">
          {gap.rationale}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <ConfidenceBar value={gap.confidence} />
        {gap.status === "active" ? (
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => onStatusChange(gap.id, "resolved")}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900"
            >
              <Text className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Resolve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onStatusChange(gap.id, "dismissed")}
              className="px-2.5 py-1.5 rounded-lg bg-card dark:bg-[#26334A] border border-border dark:border-[#384A65]"
            >
              <Text className="text-[11px] font-bold text-muted-foreground dark:text-[#94A3B8]">Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="rounded-md bg-slate-50 dark:bg-[#111C2E] px-2.5 py-1 border border-border dark:border-[#26334A]">
            <Text className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{gap.status}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PollingModal({ analysisId, onClose, onDone }: { analysisId: string; onClose: () => void; onDone: () => void }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { data, error } = useGapAnalysisStatus(analysisId);

  useEffect(() => {
    if (data?.status === "ready") {
      Alert.alert("Analysis complete", "Successfully extracted research gaps from related literature.", [
        { text: "View gaps", onPress: onDone },
      ]);
    }
  }, [data?.status, onDone]);

  const isFailed = data?.status === "failed" || !!error;

  return (
    <Modal transparent animationType="fade" visible={!!analysisId}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full rounded-3xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-6 items-center">
          {isFailed ? (
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          ) : (
            <ActivityIndicator size="large" color="#06B6D4" className="mb-4" />
          )}

          <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC] text-center mb-2">
            {isFailed ? "Gap Analysis Failed" : "Analyzing Gaps with AI"}
          </Text>

          <Text className="text-sm text-muted-foreground dark:text-[#94A3B8] text-center mb-6 leading-5">
            {isFailed
              ? data?.errorMessage || "Could not retrieve sufficient literature for this topic. Try a broader search."
              : data?.status === "analyzing"
              ? "Gemini is inspecting literature and identifying research gaps..."
              : "Queueing gap analysis job..."}
          </Text>

          <TouchableOpacity
            onPress={onClose}
            className="w-full py-3 items-center rounded-xl bg-card border border-border dark:border-[#26334A]"
          >
            <Text className="font-bold text-foreground dark:text-[#F8FAFC]">
              {isFailed ? "Dismiss" : "Cancel & Close"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function GapsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [topicInput, setTopicInput] = useState("");
  const [searchTopic, setSearchTopic] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<GapStatus>("active");
  const [minConfidenceFilter, setMinConfidenceFilter] = useState<number>(0);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTopic.trim()), 400);
    return () => clearTimeout(t);
  }, [searchTopic]);

  const { data: gapsData, isLoading, isRefetching, refetch } = useGaps({
    topic: debouncedSearch || undefined,
    status: activeTab,
    minConfidence: minConfidenceFilter > 0 ? minConfidenceFilter : undefined,
    pageSize: 30,
  });

  const analyzeGap = useAnalyzeGap();
  const patchGap = usePatchGapStatus();

  const handleAnalyze = () => {
    if (topicInput.trim().length < 3) {
      Alert.alert("Invalid Topic", "Topic must be at least 3 characters long.");
      return;
    }

    analyzeGap.mutate(
      { topic: topicInput.trim() },
      {
        onSuccess: (res) => {
          setTopicInput("");
          setActiveAnalysisId(res.analysisId);
        },
        onError: (err: any) => {
          Alert.alert("Analysis Error", err?.response?.data?.error?.message ?? "Could not submit analysis job.");
        },
      },
    );
  };

  const handleStatusChange = (id: string, status: "resolved" | "dismissed") => {
    patchGap.mutate(
      { id, status },
      {
        onError: (err: any) => {
          Alert.alert("Failed", err?.response?.data?.error?.message ?? "Could not update status.");
        },
      },
    );
  };

  const handleDonePolling = useCallback(() => {
    setActiveAnalysisId(null);
    refetch();
  }, [refetch]);

  const tabFilters: { label: string; value: GapStatus }[] = [
    { label: "Active", value: "active" },
    { label: "Resolved", value: "resolved" },
    { label: "Dismissed", value: "dismissed" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Research Gaps</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#06B6D4" />}
      >
        <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC]">AI Research Gaps</Text>
        <Text className="mt-1 text-sm text-muted-foreground dark:text-[#94A3B8]">
          Find opportunities and research gaps recommended by Gemini.
        </Text>

        {/* Form to submit gap analysis */}
        <View className="my-5 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
          <Text className="mb-2 text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">
            Analyze New Research Topic
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 py-3 text-foreground dark:text-[#F8FAFC]"
              placeholder="e.g. Chatbots in medical education"
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={topicInput}
              onChangeText={setTopicInput}
            />
            <TouchableOpacity
              onPress={handleAnalyze}
              disabled={analyzeGap.isPending}
              className="rounded-xl bg-[#1D4ED8] px-4 items-center justify-center"
            >
              {analyzeGap.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-bold text-white">Analyze</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab filters for active/resolved/dismissed */}
        <View className="flex-row border-b border-border dark:border-[#26334A] mb-4">
          {tabFilters.map((tab) => (
            <TouchableOpacity
              key={tab.value}
              className={`pb-2 px-2 mr-4 ${activeTab === tab.value ? "border-b-2 border-[#06B6D4]" : ""}`}
              onPress={() => setActiveTab(tab.value)}
            >
              <Text
                className={`text-sm font-bold capitalize ${
                  activeTab === tab.value ? "text-[#06B6D4]" : "text-muted-foreground dark:text-[#94A3B8]"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filters Panel */}
        <View className="mb-4 bg-muted/30 dark:bg-[#122137] rounded-xl p-3 border border-border/50 dark:border-[#26334A]/50">
          <View className="flex-row items-center bg-background dark:bg-[#0F1B2D] rounded-lg px-3 h-10 border border-border dark:border-[#26334A] mb-3">
            <Feather name="search" color={isDark ? "#94A3B8" : "#64748B"} size={14} />
            <TextInput
              className="flex-1 ml-2 text-xs text-foreground dark:text-[#F8FAFC]"
              placeholder="Filter gaps by topic name..."
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={searchTopic}
              onChangeText={setSearchTopic}
              autoCapitalize="none"
            />
          </View>

          <Text className="text-[10px] font-bold text-muted-foreground dark:text-[#94A3B8] uppercase mb-2">
            Min Confidence
          </Text>
          <View className="flex-row gap-2">
            {([0, 0.4, 0.7] as const).map((conf) => (
              <TouchableOpacity
                key={conf}
                onPress={() => setMinConfidenceFilter(conf)}
                className={`flex-1 py-1.5 rounded-md border items-center ${
                  minConfidenceFilter === conf
                    ? "bg-[#1D4ED8] border-[#1D4ED8]"
                    : "bg-background dark:bg-[#0F1B2D] border-border dark:border-[#26334A]"
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    minConfidenceFilter === conf ? "text-white" : "text-muted-foreground dark:text-[#94A3B8]"
                  }`}
                >
                  {conf === 0 ? "All" : conf === 0.4 ? "Medium (≥40%)" : "High (≥70%)"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Gap List */}
        {isLoading ? (
          <View className="py-24">
            <ActivityIndicator color="#06B6D4" />
          </View>
        ) : gapsData?.data && gapsData.data.length > 0 ? (
          <View>
            {gapsData.data.map((gap) => (
              <GapCard key={gap.id} gap={gap} onStatusChange={handleStatusChange} />
            ))}
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] text-right mt-2">
              {gapsData.meta.total} research gap(s) found
            </Text>
          </View>
        ) : (
          <View className="mt-8 rounded-2xl border border-dashed border-border dark:border-[#26334A] bg-card dark:bg-[#111C2E] p-10 items-center">
            <Ionicons name="bulb-outline" size={38} color={isDark ? "#64748B" : "#94A3B8"} />
            <Text className="mt-4 text-center text-base font-bold text-foreground dark:text-[#F8FAFC]">
              No research gaps found
            </Text>
            <Text className="mt-2 text-center text-xs text-muted-foreground dark:text-[#94A3B8] max-w-xs leading-5">
              Try changing the confidence filter, searching a different term, or submit a topic above to generate a new
              analysis.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Polling overlay */}
      {activeAnalysisId ? (
        <PollingModal
          analysisId={activeAnalysisId}
          onClose={() => setActiveAnalysisId(null)}
          onDone={handleDonePolling}
        />
      ) : null}
    </SafeAreaView>
  );
}
