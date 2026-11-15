import 'package:flutter/material.dart';

/// Colours of chart series, the same values the web trend charts use
/// (apps/web/src/features/trends). Charts are the one place that needs more
/// than the single accent: each series must be told apart, so every chart
/// also shows a legend or a label and never relies on colour alone.
abstract final class LumiChart {
  static const List<Color> series = [
    Color(0xFF2563EB), // blue-600, the app primary
    Color(0xFF10B981), // emerald-500
    Color(0xFFF59E0B), // amber-500
    Color(0xFF8B5CF6), // violet-500
    Color(0xFFEC4899), // pink-500
    Color(0xFF3B82F6), // blue-500
  ];

  /// Series colour for [index]; wraps around after the last one.
  static Color seriesAt(int index) => series[index % series.length];
}

/// Medal colours of the top three ranks on the leaderboard. A rank is also
/// written as a number next to it, so the colour is never the only signal.
abstract final class LumiMedal {
  static const Color gold = Color(0xFFF59E0B);
  static const Color silver = Color(0xFF64748B);
  static const Color bronze = Color(0xFFB45309);

  /// Medal colour for ranks 1–3, null for every other rank.
  static Color? forRank(int rank) => switch (rank) {
        1 => gold,
        2 => silver,
        3 => bronze,
        _ => null,
      };
}
