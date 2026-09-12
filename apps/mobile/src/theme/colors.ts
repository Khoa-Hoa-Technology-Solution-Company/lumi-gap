/**
 * Source of truth for colors. Mirrors tailwind.config.js so JS code outside
 * NativeWind className (e.g., StatusBar, navigation theming) stays in sync.
 */
export const colors = {
  background: "#0F1B2D",
  surface: "#111C2E",
  card: "#1A2332",
  cardElevated: "#202B3D",
  foreground: "#F8FAFC",
  muted: "#26334A",
  mutedForeground: "#94A3B8",
  primary: "#3B82F6",
  primaryForeground: "#FFFFFF",
  accent: "#06B6D4",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  border: "#26334A",
} as const;
