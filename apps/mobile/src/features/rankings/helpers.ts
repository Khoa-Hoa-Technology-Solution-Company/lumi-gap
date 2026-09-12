import type { ImageSourcePropType } from "react-native";

export const LEVEL_THRESHOLDS = [0, 25, 75, 150, 300, 600, 1000, 1500, 2000, 3000, Infinity];

export const LEVEL_IMAGES: Record<number, ImageSourcePropType> = {
  1: require("../../../assets/ranking/lv1.png"),
  2: require("../../../assets/ranking/lv2.png"),
  3: require("../../../assets/ranking/lv3.png"),
  4: require("../../../assets/ranking/lv4.png"),
  5: require("../../../assets/ranking/lv5.png"),
  6: require("../../../assets/ranking/lv6.png"),
  7: require("../../../assets/ranking/lv7.png"),
  8: require("../../../assets/ranking/lv8.png"),
  9: require("../../../assets/ranking/lv9.png"),
  10: require("../../../assets/ranking/lv10.png"),
};

export function getLevel(points: number): number {
  if (points >= 3000) return 10;
  if (points >= 2000) return 9;
  if (points >= 1500) return 8;
  if (points >= 1000) return 7;
  if (points >= 600) return 6;
  if (points >= 300) return 5;
  if (points >= 150) return 4;
  if (points >= 75) return 3;
  if (points >= 25) return 2;
  return 1;
}

export function getProgress(points: number, level: number): number {
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? Infinity;
  if (next === Infinity) return 100;
  return Math.min(100, Math.max(0, Math.round(((points - current) / (next - current)) * 100)));
}
