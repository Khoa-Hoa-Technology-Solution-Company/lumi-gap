import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { PaperKind } from "@trend/shared-types";

import { useCreatePaper, usePaper, useUpdatePaper, type PaperSubmitFile } from "@/features/papers";

const PAPER_KINDS: PaperKind[] = ["article", "proceedings", "preprint", "review", "book-chapter", "other"];

function countWords(value: string) {
  return value.trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "url";
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View className="mb-4">
      <Text className="text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8] mb-2">{label}</Text>
      <TextInput
        className={`bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-xl px-4 text-foreground dark:text-[#F8FAFC] ${multiline ? "min-h-[112px] py-3" : "h-12"}`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        autoCapitalize="none"
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

export default function SubmitPaperScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const createPaper = useCreatePaper();
  const updatePaper = useUpdatePaper();
  const editQuery = usePaper(editId);

  const [title, setTitle] = useState("");
  const [doi, setDoi] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [abstractText, setAbstractText] = useState("");
  const [publicationYear, setPublicationYear] = useState(String(new Date().getFullYear()));
  const [paperKind, setPaperKind] = useState<PaperKind>("article");
  const [authors, setAuthors] = useState("");
  const [keywords, setKeywords] = useState("");
  const [topics, setTopics] = useState("");
  const [openAccessUrl, setOpenAccessUrl] = useState("");
  const [pdf, setPdf] = useState<PaperSubmitFile | undefined>();

  const editingPaper = editQuery.data;
  const isEditing = Boolean(editId);
  const isSubmitting = createPaper.isPending || updatePaper.isPending;

  useEffect(() => {
    if (!editingPaper) return;
    setTitle(editingPaper.title ?? "");
    setDoi(editingPaper.externalIds?.doi ?? "");
    setPaperLink(editingPaper.paperLink ?? editingPaper.openAccessUrl ?? "");
    setAbstractText(editingPaper.abstractText ?? "");
    setPublicationYear(String(editingPaper.publicationYear ?? new Date().getFullYear()));
    setPaperKind(editingPaper.paperKind ?? "article");
    setAuthors(editingPaper.authors?.map((author) => author.displayName).join(", ") ?? "");
    setKeywords(editingPaper.keywords?.map((keyword) => keyword.keywordName).join(", ") ?? "");
    setTopics(editingPaper.topics?.map((topic) => topic.topicName).join(", ") ?? "");
    setOpenAccessUrl(editingPaper.openAccessUrl ?? "");
  }, [editingPaper]);

  const abstractWords = useMemo(() => countWords(abstractText), [abstractText]);

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > 10 * 1024 * 1024) {
      Alert.alert("File too large", "PDF must be 10MB or smaller.");
      return;
    }
    setPdf({
      uri: asset.uri,
      name: asset.name || `paper-${Date.now()}.pdf`,
      mimeType: asset.mimeType ?? "application/pdf",
    });
  };

  const submit = () => {
    const year = Number(publicationYear);
    const authorList = csv(authors);
    const keywordList = csv(keywords);
    const topicList = csv(topics);
    if (title.trim().length < 8 || countWords(title) < 3) {
      Alert.alert("Check title", "Title must be at least 8 characters and 3 words.");
      return;
    }
    if (!/^10\.\d{4,9}\/\S+$/i.test(doi.trim())) {
      Alert.alert("Check DOI", "Please enter a valid DOI.");
      return;
    }
    if (!/^https?:\/\//i.test(paperLink.trim())) {
      Alert.alert("Check link", "Paper link must be a valid URL.");
      return;
    }
    if (abstractWords < 50 || abstractWords > 350) {
      Alert.alert("Check abstract", "Abstract must be between 50 and 350 words.");
      return;
    }
    if (!year || year < 1900 || year > new Date().getFullYear()) {
      Alert.alert("Check year", "Publication year is invalid.");
      return;
    }
    if (authorList.length === 0 || keywordList.length === 0) {
      Alert.alert("Missing metadata", "At least one author and one keyword are required.");
      return;
    }
    const input = {
      title,
      doi,
      paperLink,
      abstractText,
      publicationYear: year,
      paperKind,
      authors: authorList,
      keywords: keywordList,
      topics: topicList,
      openAccessUrl,
      pdf,
    };

    const onSuccess = () => {
      Alert.alert(isEditing ? "Resubmitted" : "Submitted", isEditing ? "Your paper was sent back for review." : "Your paper request is pending admin review.");
      router.replace("/my-papers" as any);
    };
    const onError = (error: any) => {
      Alert.alert("Submit failed", error?.response?.data?.error?.message ?? "Please check the fields and try again.");
    };

    if (isEditing && editId) {
      updatePaper.mutate({ id: editId, input }, { onSuccess, onError });
    } else {
      createPaper.mutate(input, { onSuccess, onError });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">{isEditing ? "Resubmit Paper" : "Submit Paper"}</Text>
        <View className="w-8" />
      </View>

      {isEditing && editQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#06B6D4" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <View className="rounded-2xl border border-[#06B6D4] bg-[#082F49] p-4 mb-5">
              <Text className="text-[#E0F2FE] font-bold mb-1">{isEditing ? "Fix and resubmit" : "Direct submission"}</Text>
              <Text className="text-[#BAE6FD] text-xs leading-5">
                New submissions cost 100 credits and stay pending until admin review. Approved PDF uploads earn ranking points.
              </Text>
            </View>

            <Field label="Title" value={title} onChangeText={setTitle} placeholder="Paper title" />
            <Field label="DOI" value={doi} onChangeText={setDoi} placeholder="10.xxxx/xxxxx" />
            <Field label="Paper link" value={paperLink} onChangeText={setPaperLink} placeholder="https://..." keyboardType="url" />
            <Field label={`Abstract (${abstractWords}/350 words)`} value={abstractText} onChangeText={setAbstractText} placeholder="50-350 words" multiline />
            <Field label="Publication year" value={publicationYear} onChangeText={setPublicationYear} keyboardType="numeric" />

            <Text className="text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8] mb-2">Paper kind</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {PAPER_KINDS.map((kind) => (
                <TouchableOpacity
                  key={kind}
                  className={`px-3 py-2 rounded-full border ${paperKind === kind ? "bg-[#1D4ED8] border-[#1D4ED8]" : "bg-card dark:bg-[#1A2332] border-border dark:border-[#26334A]"}`}
                  onPress={() => setPaperKind(kind)}
                >
                  <Text className={`text-xs font-bold ${paperKind === kind ? "text-white" : "text-foreground dark:text-[#F8FAFC]"}`}>{kind}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Authors" value={authors} onChangeText={setAuthors} placeholder="Alice Nguyen, Bob Tran" />
            <Field label="Keywords" value={keywords} onChangeText={setKeywords} placeholder="RAG, LLM, education" />
            <Field label="Topics" value={topics} onChangeText={setTopics} placeholder="Large Language Models, Education" />
            <Field label="Open access URL" value={openAccessUrl} onChangeText={setOpenAccessUrl} placeholder="Optional" keyboardType="url" />

            <TouchableOpacity
              className="rounded-2xl border border-dashed border-[#06B6D4] bg-card dark:bg-[#1A2332] p-4 mb-5 flex-row items-center"
              onPress={pickPdf}
            >
              <View className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-[#083344] items-center justify-center mr-3">
                <Feather name="file-plus" size={18} color="#06B6D4" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground dark:text-[#F8FAFC] font-bold">{pdf?.name ?? (editingPaper?.pdfPath ? "Keep existing PDF or choose a new one" : "Choose PDF")}</Text>
                <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs mt-1">PDF only, max 10MB</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${isSubmitting ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`}
              disabled={isSubmitting}
              onPress={submit}
            >
              {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white font-bold">{isEditing ? "Resubmit paper" : "Submit paper"}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
