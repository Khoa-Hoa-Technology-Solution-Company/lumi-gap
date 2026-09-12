import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "@/stores/auth-store";
import { useRegisterDeviceToken } from "./use-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#06B6D4",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing.status === "granted"
      ? existing.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") return null;

  const projectId =
    (Constants as any).easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

export function usePushNotificationRegistration() {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const { mutateAsync: registerDeviceToken } = useRegisterDeviceToken();
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      registeredTokenRef.current = null;
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const token = await getExpoPushToken();
        if (!token || cancelled || registeredTokenRef.current === token) return;

        await registerDeviceToken({
          token,
          platform: Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "unknown",
        });
        registeredTokenRef.current = token;
      } catch (error) {
        console.warn("Push notification registration failed", error);
      }
    }

    void register();

    return () => {
      cancelled = true;
    };
  }, [accessToken, registerDeviceToken]);
}
