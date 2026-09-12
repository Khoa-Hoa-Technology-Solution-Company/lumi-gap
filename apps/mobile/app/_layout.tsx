import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { queryClient } from "@/services/query-client";
import { usePushNotificationRegistration } from "@/features/notifications";
import "../src/theme/globals.css";

/**
 * Root navigator. Three top-level stacks live alongside each other:
 *   (tabs)      — the authenticated app (bottom-tab navigation, root URL)
 *   (auth)      — login + register, shown when no token
 *   paper/[id]  — paper detail, pushed on top of tabs
 *
 * The redirect when unauthenticated happens inside `app/(tabs)/_layout.tsx`.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppStack />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppStack() {
  const { colorScheme } = useColorScheme();
  usePushNotificationRegistration();

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="paper/[id]"
          options={{
            title: "Paper detail",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="trends"
          options={{
            title: "Trends",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            title: "Reports",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="submit-paper"
          options={{
            title: "Submit paper",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="my-papers"
          options={{
            title: "My papers",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="rankings"
          options={{
            title: "Rankings",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="gaps"
          options={{
            title: "Gaps",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="projects"
          options={{
            title: "Projects",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="project/[id]"
          options={{
            title: "Project detail",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="keyword/[keyword]"
          options={{
            title: "Keyword papers",
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="report/[id]"
          options={{
            title: "Report detail",
            presentation: "modal",
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
