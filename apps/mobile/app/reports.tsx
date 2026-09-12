import { useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { ReportListItem, ReportStatus } from "@trend/shared-types";
import { Swipeable } from "react-native-gesture-handler";

import { useCreateBookmark } from "@/features/bookmarks";
import { useCreateReport, useDeleteReport, useReport, useReports } from "@/features/reports";

function statusColor(status: ReportStatus) {
  if (status === "ready") return "text-emerald-500";
  if (status === "failed") return "text-red-500";
  if (status === "generating") return "text-amber-500";
  return "text-[#06B6D4]";
}

function ReportRow({
  report,
  selected,
  onPress,
  onDeleted,
}: {
  report: ReportListItem;
  selected: boolean;
  onPress: () => void;
  onDeleted: () => void;
}) {
  const deleteReport = useDeleteReport();

  const confirmDelete = () => {
    Alert.alert("Delete report", "Delete this report?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteReport.mutate(report.id, {
            onSuccess: onDeleted,
            onError: (error: any) => {
              Alert.alert("Delete failed", error?.response?.data?.error?.message ?? "Could not delete report.");
            },
          }),
      },
    ]);
  };

  const renderRightActions = () => (
    <TouchableOpacity
      className="w-16 items-center justify-center bg-[#DC2626]"
      onPress={confirmDelete}
      disabled={deleteReport.isPending}
    >
      {deleteReport.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="trash-2" size={20} color="#FFFFFF" />}
    </TouchableOpacity>
  );

  return (
    <Swipeable
      overshootRight={false}
      friction={2}
      renderRightActions={renderRightActions}
      containerStyle={{ marginBottom: 12, borderRadius: 16, overflow: "hidden" }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.86}
        className={`rounded-2xl border p-4 ${
          selected ? "border-[#06B6D4] bg-cyan-50 dark:bg-[#082F49]" : "border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
        }`}
      >
        <View className="flex-row items-start gap-3">
          <View className="h-10 w-10 rounded-xl bg-violet-50 dark:bg-[#1E1B4B] items-center justify-center">
            <Ionicons name="sparkles" size={18} color="#8B5CF6" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{report.topic || report.query}</Text>
            <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]" numberOfLines={1}>{report.query}</Text>
            <Text className={`mt-2 text-xs font-bold uppercase ${statusColor(report.status)}`}>{report.status}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const reportsQuery = useReports({ page: 1, pageSize: 20 });
  const createReport = useCreateReport();
  const createBookmark = useCreateBookmark();
  const reports = reportsQuery.data?.reports ?? [];
  const [query, setQuery] = useState("Analyze research trends in large language models for education");
  const [topic, setTopic] = useState("LLM in education");
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const detailQuery = useReport(selectedId);

  const submit = () => {
    if (query.trim().length < 3) {
      Alert.alert("Missing query", "Enter at least 3 characters.");
      return;
    }

    createReport.mutate(
      { query: query.trim(), topic: topic.trim() || undefined, yearFrom: 2020, yearTo: 2026, deepAnalysis },
      {
        onSuccess: (data) => {
          setSelectedId(data.id);
          createBookmark.mutate(
            { targetKind: "report", targetId: data.id },
            {
              onError: (error: any) => {
                if (error?.response?.status !== 409) {
                  Alert.alert("Bookmark failed", error?.response?.data?.error?.message ?? "Report was created but not saved to bookmarks.");
                }
              },
            },
          );
          Alert.alert("Report queued", "Worker will generate it in the background.");
        },
        onError: (error: any) => {
          Alert.alert("Create failed", error?.response?.data?.error?.message ?? "Could not create report.");
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">AI Reports</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={reportsQuery.isRefetching} onRefresh={() => reportsQuery.refetch()} tintColor="#06B6D4" />}
      >
        <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC]">Generate Report</Text>

        <View className="my-5 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
          <Text className="mb-2 text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">Topic</Text>
          <TextInput
            className="mb-3 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 py-3 text-foreground dark:text-[#F8FAFC]"
            placeholder="Topic label"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            value={topic}
            onChangeText={setTopic}
          />
          
          <Text className="mb-2 text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">Question</Text>
          <TextInput
            className="min-h-24 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 py-3 text-foreground dark:text-[#F8FAFC] mb-4"
            placeholder="What should AI analyze?"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            value={query}
            onChangeText={setQuery}
            multiline
            textAlignVertical="top"
          />

          {/* Deep Analysis Switch */}
          <View className="flex-row items-center justify-between mb-4 bg-muted/40 dark:bg-[#1E293B]/40 p-3 rounded-xl border border-border/50 dark:border-[#26334A]/50">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-bold text-foreground dark:text-[#F8FAFC]">Deep Analysis</Text>
              <Text className="text-[11px] text-muted-foreground dark:text-[#94A3B8] mt-0.5 leading-4">
                Let Gemini autonomously run searches and trends analysis to write a highly detailed report.
              </Text>
            </View>
            <Switch
              value={deepAnalysis}
              onValueChange={setDeepAnalysis}
              trackColor={{ false: "#94A3B8", true: "#06B6D4" }}
              thumbColor={deepAnalysis ? "#ffffff" : "#f4f3f4"}
            />
          </View>

          <TouchableOpacity className="rounded-xl bg-[#1D4ED8] py-3 items-center" onPress={submit} disabled={createReport.isPending}>
            {createReport.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Create report</Text>}
          </TouchableOpacity>
        </View>

        {detailQuery.data ? (
          <View className="mb-5 rounded-2xl border border-[#06B6D4] bg-cyan-50 dark:bg-[#082F49] p-4">
            <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{detailQuery.data.topic || detailQuery.data.query}</Text>
            <Text className={`mt-1 text-xs font-bold uppercase ${statusColor(detailQuery.data.status)}`}>{detailQuery.data.status}</Text>
            {detailQuery.data.errorMessage ? <Text className="mt-3 text-sm text-red-500">{detailQuery.data.errorMessage}</Text> : null}
            {detailQuery.data.markdown ? (
              <View className="mt-3">
                <Text className="text-sm leading-6 text-foreground dark:text-[#CFFAFE]" numberOfLines={4}>{detailQuery.data.markdown}</Text>
                <TouchableOpacity
                  onPress={() => router.push(`/report/${detailQuery.data?.id}` as any)}
                  className="mt-3 py-2.5 items-center rounded-xl bg-[#06B6D4] flex-row justify-center gap-1.5"
                >
                  <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
                  <Text className="text-xs font-bold text-white">View Full Report</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="mt-3 text-sm text-muted-foreground dark:text-[#CFFAFE]">No markdown yet. Keep the report worker running and pull to refresh.</Text>
            )}
          </View>
        ) : null}

        <Text className="mb-3 text-lg font-bold text-foreground dark:text-[#F8FAFC]">My reports</Text>
        {reportsQuery.isLoading ? (
          <View className="py-16"><ActivityIndicator color="#06B6D4" /></View>
        ) : reports.length > 0 ? (
          reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              selected={selectedId === report.id}
              onPress={() => {
                if (report.status === "ready") {
                  router.push(`/report/${report.id}` as any);
                } else {
                  setSelectedId(report.id);
                }
              }}
              onDeleted={() => {
                if (selectedId === report.id) setSelectedId(undefined);
              }}
            />
          ))
        ) : (
          <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] bg-card dark:bg-[#111C2E] p-8">
            <Text className="text-center text-sm text-muted-foreground dark:text-[#94A3B8]">No reports yet. Create one above.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
