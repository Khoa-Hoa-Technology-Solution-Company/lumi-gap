import { useState, useEffect } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";

import { useReport } from "@/features/reports";
import { useBookmarkStatus, useCreateBookmark, useDeleteBookmark } from "@/features/bookmarks";

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-emerald-500" : value >= 0.4 ? "bg-amber-500" : "bg-red-400";
  return (
    <View className="flex-row items-center gap-1.5 mt-2">
      <View className="w-16 h-1 bg-muted dark:bg-[#26334A] rounded-full overflow-hidden">
        <View className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8]">{pct}%</Text>
    </View>
  );
}

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const reportQuery = useReport(id);
  const statusQuery = useBookmarkStatus("report", id);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const report = reportQuery.data;
  const isBookmarked = statusQuery.data?.bookmarked;

  const toggleBookmark = () => {
    if (!id) return;
    if (isBookmarked && statusQuery.data?.bookmarkId) {
      deleteBookmark.mutate(statusQuery.data.bookmarkId);
      return;
    }

    createBookmark.mutate(
      { targetKind: "report", targetId: id },
      {
        onError: (error: any) => {
          if (error?.response?.status !== 409) {
            Alert.alert("Bookmark failed", error?.response?.data?.error?.message ?? "Please try again.");
          }
        },
      },
    );
  };

  // Custom parser logic to display markdown cleanly in React Native
  const renderMarkdown = (markdownText: string) => {
    const lines = markdownText.split("\n");
    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return <View key={index} className="h-2" />;

      // Headings
      if (trimmed.startsWith("### ")) {
        return (
          <Text key={index} className="text-base font-bold text-foreground dark:text-[#F8FAFC] mt-4 mb-2">
            {renderInlineStyles(trimmed.slice(4))}
          </Text>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <Text key={index} className="text-lg font-bold text-foreground dark:text-[#F8FAFC] mt-5 mb-2.5">
            {renderInlineStyles(trimmed.slice(3))}
          </Text>
        );
      }
      if (trimmed.startsWith("# ")) {
        return (
          <Text key={index} className="text-xl font-bold text-foreground dark:text-[#F8FAFC] mt-6 mb-3">
            {renderInlineStyles(trimmed.slice(2))}
          </Text>
        );
      }

      // Bullet Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <View key={index} className="flex-row items-start pl-2 mb-2">
            <Text className="text-foreground dark:text-[#F8FAFC] mr-2 mt-0.5">•</Text>
            <Text className="flex-1 text-sm leading-6 text-foreground/80 dark:text-[#CBD5E1]">
              {renderInlineStyles(trimmed.slice(2))}
            </Text>
          </View>
        );
      }

      // Default Paragraph
      return (
        <Text key={index} className="text-sm leading-6 text-foreground/80 dark:text-[#CBD5E1] mb-3">
          {renderInlineStyles(trimmed)}
        </Text>
      );
    });
  };

  const renderInlineStyles = (text: string) => {
    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
      const boldIndex = remaining.indexOf("**");
      const citeMatch = remaining.match(/\[\d+\]/);
      const citeIndex = citeMatch ? remaining.indexOf(citeMatch[0]) : -1;

      if (boldIndex !== -1 && (citeIndex === -1 || boldIndex < citeIndex)) {
        if (boldIndex > 0) {
          parts.push(<Text key={parts.length}>{remaining.slice(0, boldIndex)}</Text>);
        }
        const nextBold = remaining.indexOf("**", boldIndex + 2);
        if (nextBold !== -1) {
          parts.push(
            <Text key={parts.length} className="font-bold text-foreground dark:text-[#F8FAFC]">
              {remaining.slice(boldIndex + 2, nextBold)}
            </Text>
          );
          remaining = remaining.slice(nextBold + 2);
        } else {
          parts.push(<Text key={parts.length}>**</Text>);
          remaining = remaining.slice(boldIndex + 2);
        }
      } else if (citeIndex !== -1) {
        if (citeIndex > 0) {
          parts.push(<Text key={parts.length}>{remaining.slice(0, citeIndex)}</Text>);
        }
        const citeStr = citeMatch![0];
        parts.push(
          <Text key={parts.length} className="font-bold text-[#06B6D4] dark:text-[#67E8F9] px-0.5">
            {citeStr}
          </Text>
        );
        remaining = remaining.slice(citeIndex + citeStr.length);
      } else {
        parts.push(<Text key={parts.length}>{remaining}</Text>);
        break;
      }
    }
    return parts;
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC] flex-1 text-center" numberOfLines={1}>
          AI Analysis Report
        </Text>
        <TouchableOpacity
          onPress={toggleBookmark}
          disabled={createBookmark.isPending || deleteBookmark.isPending}
          className="p-2 -mr-2"
        >
          <Feather name="bookmark" size={20} color={isBookmarked ? "#06B6D4" : isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
      </View>

      {reportQuery.isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#06B6D4" />
          <Text className="text-sm text-muted-foreground dark:text-[#94A3B8] mt-3">Loading report content...</Text>
        </View>
      ) : !report ? (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-center text-foreground dark:text-[#F8FAFC] font-semibold">Report not found</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={reportQuery.isRefetching} onRefresh={() => reportQuery.refetch()} tintColor="#06B6D4" />
          }
        >
          {/* Metadata Title Banner */}
          <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC] leading-8 mb-3">
            {report.topic || report.query}
          </Text>

          <View className="flex-row flex-wrap gap-2 mb-6">
            <View className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-full flex-row items-center">
              <Ionicons name="sparkles" size={11} color="#059669" />
              <Text className="text-emerald-700 dark:text-emerald-400 text-[10px] font-bold ml-1">AI-Verified Report</Text>
            </View>
            <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] px-2.5 py-1 rounded-full">
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-[10px] font-bold">
                {report.deepAnalysis ? "Deep Mode (Gemini Tools)" : "Classic RAG"}
              </Text>
            </View>
            <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] px-2.5 py-1 rounded-full">
              <Text className="text-slate-400 text-[10px] font-bold">
                {new Date(report.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {/* Markdown Content Section */}
          <View className="mb-8">
            {report.markdown ? (
              renderMarkdown(report.markdown)
            ) : (
              <Text className="text-sm text-muted-foreground dark:text-[#94A3B8] italic">
                Report body is empty.
              </Text>
            )}
          </View>

          {/* Research Gaps Section */}
          <View className="border-t border-border dark:border-[#26334A] pt-6 mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Identified Research Gaps</Text>
              <TouchableOpacity
                onPress={() => router.push(`/gaps?topic=${encodeURIComponent(report.topic || "")}` as any)}
                className="flex-row items-center gap-0.5"
              >
                <Text className="text-xs font-bold text-[#06B6D4]">View Gaps Board</Text>
                <Feather name="chevron-right" size={14} color="#06B6D4" />
              </TouchableOpacity>
            </View>

            {report.researchGaps && report.researchGaps.length > 0 ? (
              report.researchGaps.map((gap, index) => (
                <View
                  key={index}
                  className="mb-4 bg-card dark:bg-[#1A2332] border border-cyan-150 dark:border-cyan-950 rounded-2xl p-4 shadow-sm"
                >
                  <View className="flex-row items-start gap-2 mb-1.5">
                    <Ionicons name="bulb" size={16} color="#06B6D4" className="mt-0.5 shrink-0" />
                    <Text className="text-sm font-bold text-foreground dark:text-[#F8FAFC] flex-1 leading-5">
                      {gap.title}
                    </Text>
                  </View>
                  <Text className="text-xs text-muted-foreground dark:text-[#CBD5E1] mb-2 leading-5">
                    {gap.description}
                  </Text>
                  {gap.rationale ? (
                    <Text className="text-[11px] text-slate-500 dark:text-[#94A3B8] italic pl-2 border-l border-slate-300 dark:border-slate-700">
                      {gap.rationale}
                    </Text>
                  ) : null}
                  <ConfidenceBar value={gap.confidence} />
                </View>
              ))
            ) : (
              <View className="bg-muted/20 dark:bg-[#111C2E] rounded-2xl p-6 border border-dashed border-border dark:border-[#26334A] items-center">
                <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] text-center">
                  No research gaps explicitly identified in this analysis.
                </Text>
              </View>
            )}
          </View>

          {/* Metadata Panel */}
          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl p-4">
            <Text className="text-sm font-bold text-foreground dark:text-[#F8FAFC] mb-3">Analysis Metadata</Text>
            <View className="space-y-3">
              <View className="flex-row justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">AI Model</Text>
                <Text className="text-xs font-bold text-foreground dark:text-[#F8FAFC]">
                  {report.modelVersion || "Gemini 2.5 Pro"}
                </Text>
              </View>
              <View className="flex-row justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Prompt Version</Text>
                <Text className="text-xs font-bold text-foreground dark:text-[#F8FAFC]">
                  {report.promptVersion || "v1.0"}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Sources Grounded</Text>
                <Text className="text-xs font-bold text-foreground dark:text-[#F8FAFC]">
                  {report.groundingPaperIds?.length || 0} papers
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
