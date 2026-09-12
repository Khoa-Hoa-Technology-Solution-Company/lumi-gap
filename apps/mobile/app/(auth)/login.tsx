import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";

import { useLogin, useRegister } from "@/features/auth";
import { useAuthStore } from "@/stores/auth-store";

const ROLES = ["student", "lecturer", "researcher"] as const;

export default function LoginScreen() {
  const [isRegisterTab, setIsRegisterTab] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("researcher");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    if (accessToken) router.replace("/(tabs)");
  }, [accessToken]);

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }

    if (isRegisterTab) {
      if (!fullName.trim()) {
        Alert.alert("Missing name", "Please enter your full name.");
        return;
      }

      registerMutation.mutate(
        { email: email.trim(), password, fullName: fullName.trim(), role },
        {
          onError: (error: any) => {
            Alert.alert("Registration failed", error?.response?.data?.error?.message ?? "Could not create account.");
          },
        },
      );
      return;
    }

    loginMutation.mutate(
      { email: email.trim(), password },
      {
        onError: (error: any) => {
          Alert.alert("Sign in failed", error?.response?.data?.error?.message ?? "Wrong email or password.");
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="absolute -top-20 -right-24 h-64 w-64 rounded-full bg-[#06B6D4]/20" />
          <View className="absolute -bottom-16 -left-20 h-52 w-52 rounded-full bg-[#1D4ED8]/25" />

          <View className="items-center mb-8">
            <View className="w-16 h-16 rounded-2xl bg-[#0B2B45] border border-[#0E7490] items-center justify-center mb-5">
              <Ionicons name="analytics" size={30} color="#06B6D4" />
            </View>
            <Text className="text-3xl font-bold text-foreground dark:text-[#F8FAFC] tracking-tight text-center">Publication Trend</Text>
            <Text className="mt-1.5 text-sm text-[#94A3B8] text-center">AI-powered research discovery</Text>
          </View>

          <View className="bg-card dark:bg-[#111C2E]/95 border border-border dark:border-[#26334A] rounded-3xl p-5">
            <View className="bg-muted dark:bg-[#1A2332] rounded-xl p-1 flex-row mb-6">
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg items-center ${!isRegisterTab ? "bg-[#06B6D4]" : ""}`}
                onPress={() => setIsRegisterTab(false)}
                activeOpacity={0.8}
              >
                <Text className={`font-semibold text-sm ${!isRegisterTab ? "text-white" : "text-[#94A3B8]"}`}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-2.5 rounded-lg items-center ${isRegisterTab ? "bg-[#26334A]" : ""}`}
                onPress={() => setIsRegisterTab(true)}
                activeOpacity={0.8}
              >
                <Text className={`font-semibold text-sm ${isRegisterTab ? "text-white" : "text-[#94A3B8]"}`}>Create account</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-4">
              {isRegisterTab && (
                <View className="gap-2">
                  <Text className="text-xs font-semibold text-[#94A3B8] pl-1">Full name</Text>
                  <View className="h-12 flex-row items-center rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4">
                    <Ionicons name="person-outline" size={18} color="#64748B" />
                    <TextInput
                      className="ml-3 flex-1 text-sm text-foreground dark:text-[#F8FAFC]"
                      placeholder="Hoang Long Anh"
                      placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                      value={fullName}
                      onChangeText={setFullName}
                      editable={!isLoading}
                    />
                  </View>
                </View>
              )}

              <View className="gap-2">
                <Text className="text-xs font-semibold text-[#94A3B8] pl-1">Email address</Text>
                <View className="h-12 flex-row items-center rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4">
                  <Ionicons name="mail-outline" size={18} color="#64748B" />
                  <TextInput
                    className="ml-3 flex-1 text-sm text-foreground dark:text-[#F8FAFC]"
                    placeholder="researcher@university.edu"
                    placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-xs font-semibold text-[#94A3B8] pl-1">Password</Text>
                <View className="h-12 flex-row items-center rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-4">
                  <Ionicons name="lock-closed-outline" size={18} color="#64748B" />
                  <TextInput
                    className="ml-3 flex-1 text-sm text-foreground dark:text-[#F8FAFC]"
                    placeholder="••••••••"
                    placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} className="p-1">
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              {isRegisterTab && (
                <View className="flex-row gap-2">
                  {ROLES.map((item) => (
                    <TouchableOpacity
                      key={item}
                      className={`flex-1 rounded-full border px-2 py-2 ${
                        role === item ? "border-[#06B6D4] bg-[#083344]" : "border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D]"
                      }`}
                      onPress={() => setRole(item)}
                    >
                      <Text className={`text-center text-[11px] font-semibold ${role === item ? "text-[#67E8F9]" : "text-[#94A3B8]"}`}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!isRegisterTab && (
                <TouchableOpacity className="self-end">
                  <Text className="text-xs font-semibold text-[#06B6D4]">Forgot password?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                className={`h-12 rounded-xl bg-[#1D4ED8] flex-row items-center justify-center gap-2 ${isLoading ? "opacity-75" : ""}`}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text className="text-sm font-bold text-white">{isRegisterTab ? "Create account" : "Sign in"}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              <View className="flex-row items-center gap-4 py-1">
                <View className="h-[1px] flex-1 bg-[#26334A]" />
                <Text className="text-[10px] font-bold text-[#64748B]">OR</Text>
                <View className="h-[1px] flex-1 bg-[#26334A]" />
              </View>

              <TouchableOpacity className="h-12 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] flex-row items-center justify-center gap-3" disabled={isLoading}>
                <View className="w-5 h-5 rounded-full bg-[#F8FAFC] items-center justify-center">
                  <Text className="text-[10px] font-bold text-[#0F1B2D]">G</Text>
                </View>
                <Text className="text-sm font-semibold text-foreground dark:text-[#F8FAFC]">Continue with Google</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text className="mt-10 text-center text-[11px] leading-relaxed text-[#94A3B8] px-5">
            By continuing, you agree to our <Text className="text-[#06B6D4]">Terms of Service</Text> and{" "}
            <Text className="text-[#06B6D4]">Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
