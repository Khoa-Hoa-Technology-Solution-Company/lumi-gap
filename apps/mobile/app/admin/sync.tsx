import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { useAuthStore } from "@/stores/auth-store";
import { useSyncRuns, useTriggerSync, type ApiSyncRun } from "@/features/admin";
import type { AxiosError } from "axios";

export default function AdminSyncScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const { data: runs, isLoading, isError, refetch } = useSyncRuns(isAdmin);
  const triggerSyncMutation = useTriggerSync();

  // Dialog / BottomSheet state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("large language model education");
  const [yearFrom, setYearFrom] = useState("2022");
  const [maxPages, setMaxPages] = useState("1");

  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D] items-center justify-center p-6">
        <View className="items-center max-w-sm space-y-4">
          <Feather name="alert-triangle" size={48} color="#EF4444" />
          <Text className="text-2xl font-bold text-foreground dark:text-white text-center">
            Access Denied
          </Text>
          <Text className="text-muted-foreground dark:text-[#94A3B8] text-center">
            Only administrators are allowed to access the Synchronization Pipeline.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-card dark:bg-[#1A2332] px-6 py-3 rounded-xl border border-border dark:border-[#26334A]"
          >
            <Text className="text-foreground dark:text-white font-semibold">Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleTriggerSync = () => {
    if (!searchText.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập chủ đề tìm kiếm.");
      return;
    }

    const yearNum = parseInt(yearFrom);
    const pagesNum = parseInt(maxPages);

    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      Alert.alert("Lỗi", "Năm xuất bản phải nằm trong khoảng 1900 - 2100.");
      return;
    }

    if (isNaN(pagesNum) || pagesNum < 1 || pagesNum > 50) {
      Alert.alert("Lỗi", "Số trang tối đa phải từ 1 đến 50.");
      return;
    }

    triggerSyncMutation.mutate(
      {
        searchText: searchText.trim(),
        yearFrom: yearNum,
        maxPages: pagesNum,
      },
      {
        onSuccess: () => {
          Alert.alert("Thành công", "Tiến trình đồng bộ đã được đưa vào hàng đợi!");
          setIsModalOpen(false);
        },
        onError: (err) => {
          const errMsg =
            (err as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message ??
            "Không thể kích hoạt đồng bộ.";
          Alert.alert("Lỗi", errMsg);
        },
      }
    );
  };

  const showErrorMessage = (run: ApiSyncRun) => {
    if (run.errorMessage) {
      Alert.alert("Chi tiết lỗi", run.errorMessage);
    }
  };

  const renderStatusBadge = (run: ApiSyncRun) => {
    const status = run.runStatus;
    switch (status) {
      case "running":
        return (
          <View className="flex-row items-center bg-[#E1F3FE] dark:bg-[#1A2633] border border-[#C4E6FD] dark:border-[#25394E] px-2 py-1 rounded-full">
            <Text className="text-[#1F6C9F] dark:text-[#93C5FD] text-[11px] font-semibold tracking-wide capitalize">
              ● Running
            </Text>
          </View>
        );
      case "succeeded":
        return (
          <View className="flex-row items-center bg-[#EDF3EC] dark:bg-[#1C2C20] border border-[#D5E3D2] dark:border-[#2C402E] px-2 py-1 rounded-full">
            <Text className="text-[#346538] dark:text-[#86EFAC] text-[11px] font-semibold tracking-wide capitalize">
              ✓ Succeeded
            </Text>
          </View>
        );
      case "failed":
        return (
          <TouchableOpacity
            onPress={() => showErrorMessage(run)}
            className="flex-row items-center bg-[#FDEBEC] dark:bg-[#2D1C1C] border border-[#F9D5D6] dark:border-[#452020] px-2 py-1 rounded-full"
          >
            <Text className="text-[#9F2F2D] dark:text-[#FCA5A5] text-[11px] font-semibold tracking-wide capitalize">
              ✗ Failed
            </Text>
          </TouchableOpacity>
        );
      case "cancelled":
        return (
          <View className="flex-row items-center bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-full">
            <Text className="text-gray-500 dark:text-gray-400 text-[11px] font-semibold tracking-wide capitalize">
              ⃠ Cancelled
            </Text>
          </View>
        );
      default:
        return (
          <View className="flex-row items-center bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 px-2 py-1 rounded-full">
            <Text className="text-gray-500 dark:text-gray-400 text-[11px] font-semibold tracking-wide capitalize">
              {status}
            </Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <View className="flex-1 px-4 pt-4">
        {/* Page Header */}
        <View className="flex-row justify-between items-center mb-5">
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 items-center justify-center rounded-xl bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A]"
            >
              <Feather name="arrow-left" size={20} color={isDark ? "#FFFFFF" : "#0F172A"} />
            </TouchableOpacity>
            <View>
              <Text className="text-xl font-bold text-foreground dark:text-white">Sync Manager</Text>
              <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] mt-0.5">
                Monitor API Pipelines
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => refetch()}
            className="w-10 h-10 items-center justify-center rounded-xl bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A]"
          >
            <Feather name="refresh-cw" size={18} color={isDark ? "#94A3B8" : "#64748B"} />
          </TouchableOpacity>
        </View>

        {/* Action Trigger Button */}
        <TouchableOpacity
          onPress={() => setIsModalOpen(true)}
          activeOpacity={0.8}
          className="w-full bg-[#111111] dark:bg-white rounded-xl py-3.5 flex-row items-center justify-center gap-2 mb-6 border border-[#EAEAEA] dark:border-transparent active:scale-[0.98]"
        >
          <Feather name="play" size={16} color={isDark ? "#0F172A" : "#FFFFFF"} />
          <Text className="text-white dark:text-[#0F172A] font-bold text-sm">
            Trigger New Sync
          </Text>
        </TouchableOpacity>

        {/* Run History List */}
        <Text className="text-base font-bold text-foreground dark:text-white mb-3">
          Run History
        </Text>

        {isLoading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : isError ? (
          <View className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 items-center space-y-3">
            <Feather name="alert-circle" size={32} color="#EF4444" />
            <Text className="text-sm font-semibold text-red-500 text-center">
              Failed to load synchronization runs.
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              className="border border-red-500/30 px-4 py-2 rounded-lg bg-red-500/10"
            >
              <Text className="text-red-500 font-semibold text-xs">Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : !runs || runs.length === 0 ? (
          <View className="flex-1 items-center justify-center py-16 px-4 space-y-4">
            <Feather name="refresh-cw" size={40} color={isDark ? "#26334A" : "#CBD5E1"} />
            <Text className="text-base font-bold text-foreground dark:text-white text-center">
              No sync runs recorded
            </Text>
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] text-center max-w-xs leading-relaxed">
              Start pulling papers by triggering a new synchronization job using the button above.
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {runs.map((run) => (
              <View
                key={run._id}
                className="bg-card dark:bg-[#1A2332] rounded-xl p-4 mb-3 border border-border dark:border-[#26334A]"
              >
                {/* Search Term & Status */}
                <View className="flex-row justify-between items-start mb-3 gap-2">
                  <Text
                    className="text-foreground dark:text-white font-bold flex-1 text-sm leading-snug"
                    numberOfLines={2}
                  >
                    {run.searchText ?? "N/A"}
                  </Text>
                  {renderStatusBadge(run)}
                </View>

                {/* Technical Counters Grid */}
                <View className="flex-row justify-between bg-background/50 dark:bg-black/20 rounded-lg p-2.5 mb-3 gap-2 border border-border/30 dark:border-transparent">
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8] uppercase tracking-wider font-semibold">
                      Fetch
                    </Text>
                    <Text className="font-mono text-xs font-bold text-foreground dark:text-white mt-1">
                      {run.totalFetched}
                    </Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8] uppercase tracking-wider font-semibold">
                      Insert
                    </Text>
                    <Text className="font-mono text-xs font-bold text-green-600 dark:text-[#86EFAC] mt-1">
                      {run.totalInserted}
                    </Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8] uppercase tracking-wider font-semibold">
                      Update
                    </Text>
                    <Text className="font-mono text-xs font-bold text-blue-600 dark:text-[#93C5FD] mt-1">
                      {run.totalUpdated}
                    </Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8] uppercase tracking-wider font-semibold">
                      Dup
                    </Text>
                    <Text className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
                      {run.totalDuplicates}
                    </Text>
                  </View>
                </View>

                {/* Error Banner if failed */}
                {run.runStatus === "failed" && run.errorMessage && (
                  <TouchableOpacity
                    onPress={() => showErrorMessage(run)}
                    className="flex-row items-center gap-1.5 bg-red-500/5 dark:bg-red-950/20 border border-red-500/10 dark:border-red-900/30 rounded-lg p-2 mb-3"
                  >
                    <Feather name="info" size={12} color="#EF4444" />
                    <Text
                      className="text-red-500 dark:text-red-400 text-xs flex-1 truncate font-mono"
                      numberOfLines={1}
                    >
                      {run.errorMessage}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Time Details */}
                <View className="flex-row justify-between items-center">
                  <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8]">
                    Started: {new Date(run.startedAt).toLocaleString("vi-VN", { hour12: false })}
                  </Text>
                  {run.finishedAt && (
                    <Text className="text-[10px] text-muted-foreground dark:text-[#94A3B8]">
                      Duration:{" "}
                      {Math.max(
                        0,
                        Math.round(
                          (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
                        )
                      )}
                      s
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Trigger Sync Form Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end bg-black/60"
        >
          <TouchableOpacity
            className="flex-1"
            activeOpacity={1}
            onPress={() => setIsModalOpen(false)}
          />
          <View className="bg-card dark:bg-[#121E31] rounded-t-3xl border-t border-border dark:border-[#26334A] p-6 pb-8 space-y-6">
            {/* Modal Header */}
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-2">
                <Feather name="refresh-cw" size={20} color="#3B82F6" />
                <Text className="text-lg font-bold text-foreground dark:text-white">
                  Trigger New Sync
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-muted dark:bg-[#1A2332] items-center justify-center"
              >
                <Feather name="x" size={16} color={isDark ? "#FFFFFF" : "#0F172A"} />
              </TouchableOpacity>
            </View>

            {/* Modal Description */}
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] leading-relaxed -mt-2">
              Synchronize academic papers from OpenAlex live directory using a custom search topic.
            </Text>

            {/* Form Fields */}
            <View className="space-y-4">
              <View className="space-y-1.5">
                <Text className="text-xs font-semibold text-foreground dark:text-white">
                  Search Query Topic <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="e.g. large language model education"
                  placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                  className="bg-background dark:bg-black/30 text-foreground dark:text-white rounded-xl px-4 py-3 border border-border dark:border-[#26334A] text-sm"
                />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1 space-y-1.5">
                  <Text className="text-xs font-semibold text-foreground dark:text-white">
                    Publication Year From
                  </Text>
                  <TextInput
                    value={yearFrom}
                    onChangeText={setYearFrom}
                    keyboardType="numeric"
                    className="bg-background dark:bg-black/30 text-foreground dark:text-white rounded-xl px-4 py-3 border border-border dark:border-[#26334A] text-sm font-mono text-center"
                  />
                </View>

                <View className="flex-1 space-y-1.5">
                  <Text className="text-xs font-semibold text-foreground dark:text-white">
                    Max Pages (200/pg)
                  </Text>
                  <TextInput
                    value={maxPages}
                    onChangeText={setMaxPages}
                    keyboardType="numeric"
                    className="bg-background dark:bg-black/30 text-foreground dark:text-white rounded-xl px-4 py-3 border border-border dark:border-[#26334A] text-sm font-mono text-center"
                  />
                </View>
              </View>
            </View>

            {/* Modal Actions */}
            <View className="flex-row gap-3 pt-3">
              <TouchableOpacity
                onPress={() => setIsModalOpen(false)}
                className="flex-1 border border-border dark:border-[#26334A] rounded-xl py-3.5 items-center active:bg-muted"
              >
                <Text className="text-foreground dark:text-white font-bold text-sm">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTriggerSync}
                disabled={triggerSyncMutation.isPending}
                className="flex-1 bg-[#111111] dark:bg-white rounded-xl py-3.5 items-center justify-center flex-row gap-2 active:opacity-95"
              >
                {triggerSyncMutation.isPending ? (
                  <>
                    <ActivityIndicator size="small" color={isDark ? "#0F172A" : "#FFFFFF"} />
                    <Text className="text-white dark:text-[#0F172A] font-bold text-sm">
                      Running...
                    </Text>
                  </>
                ) : (
                  <>
                    <Feather name="play" size={14} color={isDark ? "#0F172A" : "#FFFFFF"} />
                    <Text className="text-white dark:text-[#0F172A] font-bold text-sm">
                      Start Sync
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
