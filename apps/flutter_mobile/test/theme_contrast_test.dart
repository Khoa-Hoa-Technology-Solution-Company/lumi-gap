import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_test/flutter_test.dart';

/// WCAG 2.x contrast ratio between two opaque colours.
double contrastRatio(Color a, Color b) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  double luminance(Color c) =>
      0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  final l1 = luminance(a);
  final l2 = luminance(b);
  final hi = math.max(l1, l2);
  final lo = math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  const modes = {'light': LumiColors.light, 'dark': LumiColors.dark};

  test('contrastRatio matches known WCAG values', () {
    expect(
      contrastRatio(const Color(0xFF000000), const Color(0xFFFFFFFF)),
      closeTo(21, 0.01),
    );
    expect(
      contrastRatio(const Color(0xFF777777), const Color(0xFF777777)),
      closeTo(1, 0.001),
    );
  });

  for (final entry in modes.entries) {
    final c = entry.value;
    final pairs = <String, (Color, Color)>{
      'foreground/background': (c.foreground, c.background),
      'foreground/surface': (c.foreground, c.surface),
      'muted/surface': (c.muted, c.surface),
      'muted/background': (c.muted, c.background),
      'foregroundSecondary/surface': (c.foregroundSecondary, c.surface),
      'foregroundSecondary/surfaceMuted': (
        c.foregroundSecondary,
        c.surfaceMuted,
      ),
      'foreground/surfaceMuted': (c.foreground, c.surfaceMuted),
      'onPrimary/primary': (c.onPrimary, c.primary),
      'primary/primarySoft': (c.primary, c.primarySoft),
      'error/surface': (c.error, c.surface),
      'success/surface': (c.success, c.surface),
      'warning/surface': (c.warning, c.surface),
      'onError/error': (c.onError, c.error),
    };
    for (final pair in pairs.entries) {
      test('${entry.key}: ${pair.key} >= 4.5:1', () {
        final ratio = contrastRatio(pair.value.$1, pair.value.$2);
        expect(
          ratio,
          greaterThanOrEqualTo(4.5),
          reason: ratio.toStringAsFixed(2),
        );
      });
    }
  }

  test(
    'light muted on surfaceMuted stays below 4.5 (why the pair is banned)',
    () {
      final ratio = contrastRatio(
        LumiColors.light.muted,
        LumiColors.light.surfaceMuted,
      );
      expect(ratio, lessThan(4.5));
      expect(ratio, closeTo(4.35, 0.05));
    },
  );

  group('disabled buttons never use the banned pair', () {
    for (final entry in {
      'light': AppTheme.lightTheme,
      'dark': AppTheme.darkTheme,
    }.entries) {
      test('${entry.key}: Filled/Elevated disabled foreground is readable', () {
        final lumi = entry.value.extension<LumiColors>()!;
        for (final style in [
          entry.value.filledButtonTheme.style!,
          entry.value.elevatedButtonTheme.style!,
        ]) {
          final fg = style.foregroundColor!.resolve({WidgetState.disabled})!;
          final bg = style.backgroundColor!.resolve({WidgetState.disabled})!;
          expect(fg, lumi.foregroundSecondary);
          expect(bg, lumi.surfaceMuted);
          expect(contrastRatio(fg, bg), greaterThanOrEqualTo(4.5));
        }
      });
    }
  });
}
