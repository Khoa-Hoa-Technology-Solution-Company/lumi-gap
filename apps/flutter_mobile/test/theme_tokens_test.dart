import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_test/flutter_test.dart';

/// The token table of the mobile foundation spec (section 2.1) and the type
/// scale (section 2.3), written out literally so a change to a colour or a
/// size has to change this file too.

Color hex(int rgb) => Color(0xFF000000 | rgb);

class _Tokens {
  const _Tokens({
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
  });

  final int background;
  final int surface;
  final int surfaceMuted;
  final int line;
  final int foreground;
  final int foregroundSecondary;
  final int muted;
  final int primary;
  final int primaryPressed;
  final int onPrimary;
  final int primarySoft;
  final int error;
  final int onError;
  final int success;
  final int warning;
  final int focus;
}

const _light = _Tokens(
  background: 0xF8FAFC, // slate-50
  surface: 0xFFFFFF,
  surfaceMuted: 0xF1F5F9, // slate-100
  line: 0xE2E8F0, // slate-200
  foreground: 0x0F172A, // slate-900
  foregroundSecondary: 0x475569, // slate-600
  muted: 0x64748B, // slate-500
  primary: 0x2563EB, // blue-600
  primaryPressed: 0x1D4ED8,
  onPrimary: 0xFFFFFF,
  primarySoft: 0xEFF6FF, // blue-50
  error: 0xDC2626, // red-600
  onError: 0xFFFFFF,
  success: 0x15803D, // green-700
  warning: 0xB45309, // amber-700
  focus: 0x2563EB,
);

const _dark = _Tokens(
  background: 0x0B1120,
  surface: 0x131C31,
  surfaceMuted: 0x1E293B, // slate-800
  line: 0x1E293B,
  foreground: 0xF1F5F9, // slate-100
  foregroundSecondary: 0xCBD5E1, // slate-300
  muted: 0x94A3B8, // slate-400
  primary: 0x60A5FA, // blue-400
  primaryPressed: 0x93C5FD,
  onPrimary: 0x0B1120,
  primarySoft: 0x172554, // blue-950
  error: 0xF87171, // red-400
  onError: 0x0B1120,
  success: 0x4ADE80, // green-400
  warning: 0xFBBF24, // amber-400
  focus: 0x60A5FA,
);

void main() {
  final modes =
      <String, ({_Tokens expected, LumiColors lumi, ThemeData theme})>{
        'light': (
          expected: _light,
          lumi: LumiColors.light,
          theme: AppTheme.lightTheme,
        ),
        'dark': (
          expected: _dark,
          lumi: LumiColors.dark,
          theme: AppTheme.darkTheme,
        ),
      };

  for (final entry in modes.entries) {
    final e = entry.value.expected;
    final lumi = entry.value.lumi;
    final theme = entry.value.theme;
    final scheme = theme.colorScheme;

    group('${entry.key} LumiColors', () {
      test('every token matches the spec table', () {
        expect(lumi.background, hex(e.background), reason: 'background');
        expect(lumi.surface, hex(e.surface), reason: 'surface');
        expect(lumi.surfaceMuted, hex(e.surfaceMuted), reason: 'surfaceMuted');
        expect(lumi.line, hex(e.line), reason: 'line');
        expect(lumi.foreground, hex(e.foreground), reason: 'foreground');
        expect(
          lumi.foregroundSecondary,
          hex(e.foregroundSecondary),
          reason: 'foregroundSecondary',
        );
        expect(lumi.muted, hex(e.muted), reason: 'muted');
        expect(lumi.primary, hex(e.primary), reason: 'primary');
        expect(
          lumi.primaryPressed,
          hex(e.primaryPressed),
          reason: 'primaryPressed',
        );
        expect(lumi.onPrimary, hex(e.onPrimary), reason: 'onPrimary');
        expect(lumi.primarySoft, hex(e.primarySoft), reason: 'primarySoft');
        expect(lumi.error, hex(e.error), reason: 'error');
        expect(lumi.onError, hex(e.onError), reason: 'onError');
        expect(lumi.success, hex(e.success), reason: 'success');
        expect(lumi.warning, hex(e.warning), reason: 'warning');
        expect(lumi.focus, hex(e.focus), reason: 'focus');
      });

      test(
        'the theme carries the same extension and is readable via context',
        () {
          expect(theme.extension<LumiColors>(), same(lumi));
        },
      );
    });

    group('${entry.key} ColorScheme', () {
      test('maps the tokens to the Material roles', () {
        expect(
          scheme.brightness,
          entry.key == 'light' ? Brightness.light : Brightness.dark,
        );
        expect(scheme.primary, hex(e.primary));
        expect(scheme.onPrimary, hex(e.onPrimary));
        expect(scheme.primaryContainer, hex(e.primarySoft));
        expect(scheme.onPrimaryContainer, hex(e.primary));
        expect(scheme.surface, hex(e.surface));
        expect(scheme.onSurface, hex(e.foreground));
        expect(scheme.onSurfaceVariant, hex(e.muted));
        expect(scheme.surfaceContainerHighest, hex(e.surfaceMuted));
        expect(scheme.outline, hex(e.line));
        expect(scheme.outlineVariant, hex(e.line));
        expect(scheme.error, hex(e.error));
        expect(scheme.onError, hex(e.onError));
      });

      test('the page background and component themes use the tokens', () {
        expect(theme.scaffoldBackgroundColor, hex(e.background));
        expect(theme.appBarTheme.backgroundColor, hex(e.surface));
        expect(theme.appBarTheme.scrolledUnderElevation, 0);
        expect(theme.navigationBarTheme.backgroundColor, hex(e.surface));
        expect(theme.navigationBarTheme.indicatorColor, hex(e.primarySoft));
        expect(theme.cardTheme.color, hex(e.surface));
        expect(theme.cardTheme.elevation, 0);
        expect(theme.dividerTheme.color, hex(e.line));
        expect(theme.bottomSheetTheme.backgroundColor, hex(e.surface));
        expect(theme.dialogTheme.backgroundColor, hex(e.surface));
      });

      test('no purple or cyan leaks in from Material defaults', () {
        const cyan = 0x06B6D4;
        final colors = [
          scheme.primary,
          scheme.secondary,
          scheme.tertiary,
          scheme.surfaceTint,
          scheme.inversePrimary,
        ];
        expect(colors, isNot(contains(hex(cyan))));
        // `secondary`/`tertiary` are our own greys/green, not seed-generated.
        expect(scheme.secondary, hex(e.foregroundSecondary));
        expect(scheme.tertiary, hex(e.success));
        expect(scheme.surfaceTint, Colors.transparent);
      });

      test(
        'text on primary surfaces uses onPrimary, body text uses foreground',
        () {
          expect(theme.primaryTextTheme.bodyLarge?.color, hex(e.onPrimary));
          expect(theme.textTheme.bodyLarge?.color, hex(e.foreground));
        },
      );
    });

    group('${entry.key} component sizes', () {
      test('buttons are at least 48dp tall with 8dp corners', () {
        for (final style in [
          theme.filledButtonTheme.style!,
          theme.elevatedButtonTheme.style!,
          theme.outlinedButtonTheme.style!,
          theme.textButtonTheme.style!,
        ]) {
          expect(
            style.minimumSize!.resolve({})!.height,
            greaterThanOrEqualTo(48),
          );
          final shape = style.shape!.resolve({})! as RoundedRectangleBorder;
          expect(shape.borderRadius, BorderRadius.circular(8));
        }
      });

      test('cards are 8dp, sheets 12dp, nav bar 80dp, app bar 64dp', () {
        expect(
          (theme.cardTheme.shape! as RoundedRectangleBorder).borderRadius,
          BorderRadius.circular(8),
        );
        expect(
          (theme.bottomSheetTheme.shape! as RoundedRectangleBorder)
              .borderRadius,
          const BorderRadius.vertical(top: Radius.circular(12)),
        );
        expect(theme.navigationBarTheme.height, 80);
        expect(theme.appBarTheme.toolbarHeight, 64);
      });

      test(
        'input fields always show their label and focus with a 2px border',
        () {
          final input = theme.inputDecorationTheme;
          expect(input.floatingLabelBehavior, FloatingLabelBehavior.always);
          expect(
            (input.focusedBorder! as OutlineInputBorder).borderSide.width,
            2,
          );
          expect(
            (input.focusedBorder! as OutlineInputBorder).borderSide.color,
            hex(e.focus),
          );
          expect(
            (input.errorBorder! as OutlineInputBorder).borderSide.color,
            hex(e.error),
          );
        },
      );
    });
  }

  test('light and dark palettes are really different', () {
    expect(LumiColors.light.background, isNot(LumiColors.dark.background));
    expect(LumiColors.light.primary, isNot(LumiColors.dark.primary));
  });

  group('type scale (spec 2.3)', () {
    final text = AppTheme.lightTheme.textTheme;

    void expectStyle(
      TextStyle? style,
      double size,
      double lineHeight,
      FontWeight weight,
      String name,
    ) {
      expect(style, isNotNull, reason: name);
      expect(style!.fontSize, size, reason: '$name size');
      expect(
        style.height! * style.fontSize!,
        closeTo(lineHeight, 0.001),
        reason: '$name line height',
      );
      expect(style.fontWeight, weight, reason: '$name weight');
      expect(style.fontFamily, 'SourceSans3', reason: '$name family');
    }

    test('matches the table', () {
      expectStyle(text.headlineSmall, 24, 32, FontWeight.w600, 'headlineSmall');
      expectStyle(text.titleLarge, 20, 28, FontWeight.w600, 'titleLarge');
      expectStyle(text.titleMedium, 16, 24, FontWeight.w600, 'titleMedium');
      expectStyle(text.bodyLarge, 16, 24, FontWeight.w400, 'bodyLarge');
      expectStyle(text.bodyMedium, 14, 20, FontWeight.w400, 'bodyMedium');
      expectStyle(text.bodySmall, 12, 16, FontWeight.w400, 'bodySmall');
      expectStyle(text.labelLarge, 14, 20, FontWeight.w600, 'labelLarge');
      expectStyle(text.labelMedium, 12, 16, FontWeight.w500, 'labelMedium');
    });

    test('is a function of the colour passed in', () {
      final onPrimary = AppTypography.textTheme(const Color(0xFFFFFFFF));
      expect(onPrimary.bodyLarge?.color, const Color(0xFFFFFFFF));
      expect(onPrimary.bodyLarge?.fontSize, text.bodyLarge?.fontSize);
    });
  });
}
