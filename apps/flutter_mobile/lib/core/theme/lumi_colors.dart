import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_colors.dart';

/// Lumi colors that Material's [ColorScheme] has no slot for.
@immutable
class LumiColors extends ThemeExtension<LumiColors> {
  const LumiColors({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.line,
    required this.foreground,
    required this.foregroundSecondary,
    required this.muted,
    required this.primary,
    required this.primaryPressed,
    required this.onPrimary,
    required this.primarySoft,
    required this.error,
    required this.onError,
    required this.success,
    required this.warning,
    required this.focus,
    required this.scrim,
  });

  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color line;
  final Color foreground;
  final Color foregroundSecondary;
  final Color muted;
  final Color primary;
  final Color primaryPressed;
  final Color onPrimary;
  final Color primarySoft;
  final Color error;
  final Color onError;
  final Color success;
  final Color warning;
  final Color focus;
  final Color scrim;

  static const LumiColors light = LumiColors(
    background: LumiLight.background,
    surface: LumiLight.surface,
    surfaceMuted: LumiLight.surfaceMuted,
    line: LumiLight.line,
    foreground: LumiLight.foreground,
    foregroundSecondary: LumiLight.foregroundSecondary,
    muted: LumiLight.muted,
    primary: LumiLight.primary,
    primaryPressed: LumiLight.primaryPressed,
    onPrimary: LumiLight.onPrimary,
    primarySoft: LumiLight.primarySoft,
    error: LumiLight.error,
    onError: LumiLight.onError,
    success: LumiLight.success,
    warning: LumiLight.warning,
    focus: LumiLight.focus,
    scrim: LumiLight.scrim,
  );

  static const LumiColors dark = LumiColors(
    background: LumiDark.background,
    surface: LumiDark.surface,
    surfaceMuted: LumiDark.surfaceMuted,
    line: LumiDark.line,
    foreground: LumiDark.foreground,
    foregroundSecondary: LumiDark.foregroundSecondary,
    muted: LumiDark.muted,
    primary: LumiDark.primary,
    primaryPressed: LumiDark.primaryPressed,
    onPrimary: LumiDark.onPrimary,
    primarySoft: LumiDark.primarySoft,
    error: LumiDark.error,
    onError: LumiDark.onError,
    success: LumiDark.success,
    warning: LumiDark.warning,
    focus: LumiDark.focus,
    scrim: LumiDark.scrim,
  );

  @override
  LumiColors copyWith({
    Color? background,
    Color? surface,
    Color? surfaceMuted,
    Color? line,
    Color? foreground,
    Color? foregroundSecondary,
    Color? muted,
    Color? primary,
    Color? primaryPressed,
    Color? onPrimary,
    Color? primarySoft,
    Color? error,
    Color? onError,
    Color? success,
    Color? warning,
    Color? focus,
    Color? scrim,
  }) {
    return LumiColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      line: line ?? this.line,
      foreground: foreground ?? this.foreground,
      foregroundSecondary: foregroundSecondary ?? this.foregroundSecondary,
      muted: muted ?? this.muted,
      primary: primary ?? this.primary,
      primaryPressed: primaryPressed ?? this.primaryPressed,
      onPrimary: onPrimary ?? this.onPrimary,
      primarySoft: primarySoft ?? this.primarySoft,
      error: error ?? this.error,
      onError: onError ?? this.onError,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      focus: focus ?? this.focus,
      scrim: scrim ?? this.scrim,
    );
  }

  @override
  LumiColors lerp(ThemeExtension<LumiColors>? other, double t) {
    if (other is! LumiColors) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return LumiColors(
      background: l(background, other.background),
      surface: l(surface, other.surface),
      surfaceMuted: l(surfaceMuted, other.surfaceMuted),
      line: l(line, other.line),
      foreground: l(foreground, other.foreground),
      foregroundSecondary: l(foregroundSecondary, other.foregroundSecondary),
      muted: l(muted, other.muted),
      primary: l(primary, other.primary),
      primaryPressed: l(primaryPressed, other.primaryPressed),
      onPrimary: l(onPrimary, other.onPrimary),
      primarySoft: l(primarySoft, other.primarySoft),
      error: l(error, other.error),
      onError: l(onError, other.onError),
      success: l(success, other.success),
      warning: l(warning, other.warning),
      focus: l(focus, other.focus),
      scrim: l(scrim, other.scrim),
    );
  }
}

extension LumiColorsContext on BuildContext {
  /// Lumi palette for the current brightness. Falls back to light if the
  /// extension is missing (e.g. a bare MaterialApp in a widget test).
  LumiColors get lumi =>
      Theme.of(this).extension<LumiColors>() ?? LumiColors.light;
}
