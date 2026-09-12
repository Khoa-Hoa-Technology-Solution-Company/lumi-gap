class LevelHelper {
  static const List<int> levelThresholds = [
    0, 25, 75, 150, 300, 600, 1000, 1500, 2000, 3000
  ];

  static int getLevel(int points) {
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

  static double getProgress(int points, int level) {
    if (level < 1 || level > 10) return 1;
    final current = levelThresholds[level - 1];
    if (level == 10) return 1;
    final next = levelThresholds[level];
    if (points <= current) return 0;
    if (points >= next) return 1;
    return (points - current) / (next - current);
  }

  static String getLevelAsset(int level) {
    final lvl = level.clamp(1, 10);
    return 'assets/ranking/lv$lvl.png';
  }
}
