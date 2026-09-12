export const LEVEL_THRESHOLDS = [0, 25, 75, 150, 300, 600, 1000, 1500, 2000, 3000, Infinity];

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

export function getLevelProgress(points: number, level: number): number {
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[10]!;
  if (nextThreshold === Infinity) return 100;
  return Math.min(100, Math.round(((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100));
}

export function getNextLevelPoints(level: number): number {
  return LEVEL_THRESHOLDS[level] === Infinity ? LEVEL_THRESHOLDS[9]! : (LEVEL_THRESHOLDS[level] ?? 9999);
}
