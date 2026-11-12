import 'package:flutter/material.dart';

/// Mobile type scale (spec mobile-foundation §2.3). Font: Source Sans 3.
abstract final class AppTypography {
  static const String fontFamily = 'SourceSans3';

  static TextTheme textTheme(Color foreground) {
    TextStyle s(double size, double lineHeight, FontWeight weight) => TextStyle(
          fontFamily: fontFamily,
          fontSize: size,
          height: lineHeight / size,
          fontWeight: weight,
          color: foreground,
          letterSpacing: 0,
        );

    return TextTheme(
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
