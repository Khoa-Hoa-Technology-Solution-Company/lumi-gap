import 'package:flutter/material.dart';

/// One soft tint: a tile background and the icon/text colour on it.
@immutable
class LumiTint {
  const LumiTint(this.background, this.foreground);

  final Color background;
  final Color foreground;
}

/// The mobile app's own accents (direction A, approved 2026-11-22): the
/// brand blue stays the one action colour; these tints only tell entry
/// points apart (Trends, Gaps, Reports, Rankings) and colour avatars.
/// Each pair passes 4.5:1 for its foreground on its background.
@immutable
class LumiTints {
  const LumiTints({
    required this.blue,
    required this.amber,
    required this.teal,
    required this.pink,
    required this.hero,
    required this.onHero,
    required this.onHeroSoft,
    required this.navSelected,
    required this.ink,
    required this.onInk,
    required this.onInkSoft,
    required this.heroTile,
  });

  final LumiTint blue;
  final LumiTint amber;
  final LumiTint teal;
  final LumiTint pink;

  /// The coloured band at the top of Home.
  final Color hero;
  final Color onHero;
  final Color onHeroSoft;

  /// The open tab's pill on the dark bottom bar.
  final Color navSelected;

  /// Feature surfaces (a highlighted card, the project header): the brand
  /// blue, like the headers, so light mode has no black blocks.
  final Color ink;
  final Color onInk;
  final Color onInkSoft;

  /// A tile on the blue surfaces (stat tiles): a shade darker, so white text
  /// on it keeps its contrast.
  final Color heroTile;

  /// The four tints in order, for lists of entry points.
  List<LumiTint> get cycle => [blue, amber, teal, pink];

  static const LumiTints light = LumiTints(
    blue: LumiTint(Color(0xFFDBEAFE), Color(0xFF1D4ED8)),
    amber: LumiTint(Color(0xFFFEF3C7), Color(0xFF92400E)),
    teal: LumiTint(Color(0xFFCCFBF1), Color(0xFF115E59)),
    pink: LumiTint(Color(0xFFFCE7F3), Color(0xFF9D174D)),
    hero: Color(0xFF2563EB),
    onHero: Color(0xFFFFFFFF),
    // Near-white blue: over 4.5:1 on the hero blue (blue-100 was 4.24:1).
    onHeroSoft: Color(0xFFF5F8FF),
    navSelected: Color(0xFF2563EB),
    ink: Color(0xFF2563EB),
    onInk: Color(0xFFFFFFFF),
    onInkSoft: Color(0xFFF5F8FF),
    heroTile: Color(0x290F172A),
  );

  static const LumiTints dark = LumiTints(
    blue: LumiTint(Color(0xFF1E3A8A), Color(0xFFBFDBFE)),
    amber: LumiTint(Color(0xFF451A03), Color(0xFFFDE68A)),
    teal: LumiTint(Color(0xFF134E4A), Color(0xFF99F6E4)),
    pink: LumiTint(Color(0xFF500724), Color(0xFFFBCFE8)),
    // Brighter than the old navy: the dark theme read as all black.
    hero: Color(0xFF1D4ED8),
    onHero: Color(0xFFFFFFFF),
    onHeroSoft: Color(0xFFDBEAFE),
    navSelected: Color(0xFF2563EB),
    ink: Color(0xFF1D4ED8),
    onInk: Color(0xFFFFFFFF),
    onInkSoft: Color(0xFFDBEAFE),
    heroTile: Color(0x33020617),
  );
}

extension LumiTintsContext on BuildContext {
  /// Tints for the current brightness.
  LumiTints get tints => Theme.of(this).brightness == Brightness.dark
      ? LumiTints.dark
      : LumiTints.light;
}

/// The card elevation of the app: a soft shadow in light mode, a hairline
/// border in dark mode (shadows do not read on a dark page).
abstract final class LumiElevation {
  static const double cardRadius = 20;

  static List<BoxShadow> card(Brightness brightness) =>
      brightness == Brightness.dark
          ? const []
          : const [
              BoxShadow(
                color: Color(0x140F172A),
                blurRadius: 24,
                offset: Offset(0, 8),
              ),
            ];

  /// The floating bottom bar's shadow.
  static const List<BoxShadow> floating = [
    BoxShadow(
      color: Color(0x400F172A),
      blurRadius: 30,
      offset: Offset(0, 12),
    ),
  ];
}
