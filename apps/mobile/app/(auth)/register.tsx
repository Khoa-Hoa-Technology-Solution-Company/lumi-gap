import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";

import { useRegister } from "@/features/auth";

const ROLES = ["student", "lecturer", "researcher"] as const;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("researcher");
  const registerMutation = useRegister();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleRegister = () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert("Missing fields", "Please complete all required fields.");
      return;
    }

    registerMutation.mutate(
      { fullName: fullName.trim(), email: email.trim(), password, role },
      {
        onError: (error: any) => {
          Alert.alert("Registration failed", error?.response?.data?.error?.message ?? "Could not create account.");
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 28 }}>
          <View className="items-center mb-8">
            <View className="w-16 h-16 rounded-2xl bg-[#0B2B45] border border-[#0E7490] items-center justify-center mb-5">
              <Ionicons name="person-add" size={30} color="#06B6D4" />
            </View>
            <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC] tracking-tight text-center">Create account</Text>
            <Text className="mt-1.5 text-sm text-[#94A3B8] text-center">Start your research workspace</Text>
          </View>

          <View className="bg-card dark:bg-[#111C2E] border border-border dark:border-[#26334A] rounded-3xl p-5 gap-4">
            <TextInput
              className="h-12 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 text-foreground dark:text-[#F8FAFC]"
              placeholder="Full name"
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={fullName}
              onChangeText={setFullName}
            />
            <TextInput
              className="h-12 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 text-foreground dark:text-[#F8FAFC]"
              placeholder="researcher@university.edu"
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              className="h-12 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4 text-foreground dark:text-[#F8FAFC]"
              placeholder="Password"
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <View className="flex-row gap-2">
              {ROLES.map((item) => (
                <TouchableOpacity
                  key={item}
                  className={`flex-1 rounded-full border px-2 py-2 ${role === item ? "border-[#06B6D4] bg-[#083344]" : "border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D]"}`}
                  onPress={() => setRole(item)}
                >
                  <Text className={`text-center text-[11px] font-semibold ${role === item ? "text-[#67E8F9]" : "text-[#94A3B8]"}`}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              className="h-12 rounded-xl bg-[#1D4ED8] flex-row items-center justify-center"
              onPress={handleRegister}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Create account</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/login")} className="items-center py-2">
              <Text className="text-sm font-semibold text-[#06B6D4]">Already have an account? Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
