import { useCallback } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { Paper } from "@trend/shared-types";

import {
  useAcceptPaperPdf,
  useCancelPaperRequest,
  useMyPapers,
  useRejectPaperPdf,
  useUploadPaperPdf,
  type PaperSubmitFile,
} from "@/features/papers";
import { useAuthStore } from "@/stores/auth-store";

function statusStyle(status?: Paper["paperStatus"]) {
  switch (status) {
    case "downloaded":
      return { label: "Downloaded", bg: "bg-emerald-950", text: "text-emerald-300" };
    case "not-downloaded":
      return { label: "Needs PDF", bg: "bg-blue-950", text: "text-blue-300" };
    case "pending-requester-acceptance":
      return { label: "Review PDF", bg: "bg-violet-950", text: "text-violet-300" };
    case "rejected":
      return { label: "Rejected", bg: "bg-red-950", text: "text-red-300" };
    default:
      return { label: "Pending", bg: "bg-amber-950", text: "text-amber-300" };
  }
}

function sameUser(value: string | undefined, userId: string | undefined) {
  return Boolean(value && userId && value === userId);
}

export default function MyPapersScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const user = useAuthStore((state) => state.user);
  const papersQuery = useMyPapers();
  const uploadPdf = useUploadPaperPdf();
  const cancelPaper = useCancelPaperRequest();
  const acceptPdf = useAcceptPaperPdf();
  const rejectPdf = useRejectPaperPdf();

  const pickPdf = async (): Promise<PaperSubmitFile | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    if (asset.size && asset.size > 10 * 1024 * 1024) {
      Alert.alert("File too large", "PDF must be 10MB or smaller.");
      return null;
    }
    return { uri: asset.uri, name: asset.name || `paper-${Date.now()}.pdf`, mimeType: asset.mimeType ?? "application/pdf" };
  };

  const handleUpload = async (paper: Paper) => {
    const file = await pickPdf();
    if (!file) return;
    uploadPdf.mutate(
      { id: paper.id, file },
      {
        onSuccess: () => Alert.alert("Uploaded", "PDF uploaded successfully."),
        onError: (error: any) => Alert.alert("Upload failed", error?.response?.data?.error?.message ?? "Please try again."),
      },
    );
  };

  const handleCancel = (paper: Paper) => {
    Alert.alert("Cancel request", "This will remove the pending request and refund the request credits.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: () =>
          cancelPaper.mutate(paper.id, {
            onSuccess: () => Alert.alert("Cancelled", "Paper request cancelled."),
            onError: (error: any) => Alert.alert("Cancel failed", error?.response?.data?.error?.message ?? "Please try again."),
          }),
      },
    ]);
  };

  const handleReject = (paper: Paper) => {
    Alert.alert("Reject uploaded PDF", "The PDF will be removed and the paper will return to Needs PDF.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () =>
          rejectPdf.mutate(paper.id, {
            onSuccess: () => Alert.alert("Rejected", "PDF rejected."),
            onError: (error: any) => Alert.alert("Reject failed", error?.response?.data?.error?.message ?? "Please try again."),
          }),
      },
    ]);
  };

  const refetch = useCallback(() => {
    void papersQuery.refetch();
  }, [papersQuery]);

  const papers = papersQuery.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">My Papers</Text>
        <TouchableOpacity onPress={() => router.push("/submit-paper" as any)} className="p-2 -mr-2">
          <Feather name="plus" size={22} color="#06B6D4" />
        </TouchableOpacity>
      </View>

      {papersQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#06B6D4" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={papersQuery.isRefetching} onRefresh={refetch} tintColor="#06B6D4" />}
        >
          <TouchableOpacity
            className="mb-4 rounded-2xl bg-[#1D4ED8] p-4 flex-row items-center"
            onPress={() => router.push("/submit-paper" as any)}
          >
            <View className="w-10 h-10 rounded-xl bg-white/15 items-center justify-center mr-3">
              <Feather name="upload-cloud" size={20} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold">Submit a new paper</Text>
              <Text className="text-blue-100 text-xs mt-1">Attach a PDF and send it for admin review.</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#BFDBFE" />
          </TouchableOpacity>

          {papers.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8 items-center">
              <Feather name="file-text" size={34} color={isDark ? "#475569" : "#94A3B8"} />
              <Text className="text-foreground dark:text-[#F8FAFC] font-bold mt-3">No paper requests yet</Text>
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm text-center mt-2">
                Submit your first paper to start the review flow.
              </Text>
            </View>
          ) : (
            papers.map((paper) => {
              const status = statusStyle(paper.paperStatus);
              const isOwner = sameUser(paper.requestedBy?._id, user?.id);
              const canCancel = paper.paperStatus === "pending" && isOwner;
              const canReviewPdf = paper.paperStatus === "pending-requester-acceptance" && isOwner;
              const canUploadPdf = !paper.pdfPath && paper.paperStatus !== "rejected";
              return (
                <View key={paper.id} className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <TouchableOpacity className="flex-1" onPress={() => router.push(`/paper/${paper.id}` as any)}>
                      <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-sm leading-5" numberOfLines={2}>
                        {paper.title}
                      </Text>
                      <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs mt-1" numberOfLines={1}>
                        {paper.publicationYear} · {paper.authors?.map((author) => author.displayName).join(", ") || "Unknown authors"}
                      </Text>
                    </TouchableOpacity>
                    <View className={`${status.bg} rounded-md px-2 py-1`}>
                      <Text className={`${status.text} text-[10px] font-bold uppercase`}>{status.label}</Text>
                    </View>
                  </View>

                  {!!paper.rejectionReason && (
                    <View className="mt-3 rounded-xl bg-red-950/30 border border-red-900/50 p-3">
                      <Text className="text-red-300 text-xs font-bold">Reason</Text>
                      <Text className="text-red-100 text-xs mt-1">{paper.rejectionReason}</Text>
                    </View>
                  )}

                  <View className="flex-row flex-wrap gap-2 mt-4">
                    <TouchableOpacity className="px-3 py-2 rounded-lg bg-[#0F172A] border border-[#26334A]" onPress={() => router.push(`/paper/${paper.id}` as any)}>
                      <Text className="text-white text-xs font-bold">View</Text>
                    </TouchableOpacity>
                    {canUploadPdf && (
                      <TouchableOpacity className="px-3 py-2 rounded-lg bg-[#083344] border border-[#0E7490]" onPress={() => void handleUpload(paper)} disabled={uploadPdf.isPending}>
                        <Text className="text-cyan-200 text-xs font-bold">Upload PDF</Text>
                      </TouchableOpacity>
                    )}
                    {canReviewPdf && (
                      <>
                        <TouchableOpacity className="px-3 py-2 rounded-lg bg-emerald-950 border border-emerald-700" onPress={() => acceptPdf.mutate(paper.id)}>
                          <Text className="text-emerald-200 text-xs font-bold">Accept PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="px-3 py-2 rounded-lg bg-red-950 border border-red-800" onPress={() => handleReject(paper)}>
                          <Text className="text-red-200 text-xs font-bold">Reject PDF</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {paper.paperStatus === "rejected" && (
                      <TouchableOpacity className="px-3 py-2 rounded-lg bg-violet-950 border border-violet-700" onPress={() => router.push(`/submit-paper?editId=${paper.id}` as any)}>
                        <Text className="text-violet-200 text-xs font-bold">Edit & Resubmit</Text>
                      </TouchableOpacity>
                    )}
                    {canCancel && (
                      <TouchableOpacity className="px-3 py-2 rounded-lg bg-red-950 border border-red-800" onPress={() => handleCancel(paper)} disabled={cancelPaper.isPending}>
                        <Text className="text-red-200 text-xs font-bold">Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
