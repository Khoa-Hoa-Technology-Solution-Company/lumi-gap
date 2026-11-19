import 'package:flutter/material.dart';

/// Mobile type scale (spec mobile-foundation §2.3). Font: Source Sans 3.
abstract final class AppTypography {
  static const String fontFamily = 'SourceSans3';

  /// The scale in [foreground]. This is `Theme.of(context).textTheme`.
  static TextTheme textTheme(Color foreground) => _build(foreground);

  /// The same scale with no colour: size, line height and weight only. Text
  /// styled with it keeps the colour of where it sits (the label of a filled
  /// button, a chip, an alert), which the coloured scale would override.
  static final TextTheme metrics = _build(null);

  static TextTheme _build(Color? foreground) {
    TextStyle s(double size, double lineHeight, FontWeight weight) => TextStyle(
          fontFamily: fontFamily,
          fontSize: size,
          height: lineHeight / size,
          fontWeight: weight,
          color: foreground,
          letterSpacing: 0,
        );

    return TextTheme(
      // One per screen at most: the hero figure (36) or the greeting (28).
      displaySmall: s(36, 44, FontWeight.w700),
      headlineMedium: s(28, 36, FontWeight.w700),
      headlineSmall: s(24, 32, FontWeight.w600),
      titleLarge: s(20, 28, FontWeight.w600),
      titleMedium: s(16, 24, FontWeight.w600),
      titleSmall: s(14, 20, FontWeight.w600),
      bodyLarge: s(16, 24, FontWeight.w400),
      bodyMedium: s(14, 20, FontWeight.w400),
      bodySmall: s(12, 16, FontWeight.w400),
      labelLarge: s(14, 20, FontWeight.w600),
      labelMedium: s(12, 16, FontWeight.w500),
      labelSmall: s(12, 16, FontWeight.w500),
    );
  }
}

extension LumiTypeContext on BuildContext {
  /// Type roles without a colour ([AppTypography.metrics]). Use it where a
  /// screen used to write `TextStyle(fontSize: …)`: the size comes from the
  /// scale and the colour is still inherited or set next to it.
  TextTheme get type => AppTypography.metrics;
}
