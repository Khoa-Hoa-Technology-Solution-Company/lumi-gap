import { Stack } from "expo-router";

/**
 * Auth stack. Login and Register live here. No bottom tabs visible.
 * Owner: Dev 2 (Personalization) — see docs/PHASE_A_TEAM_TASKS.md.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F1B2D" },
      }}
    />
  );
}
