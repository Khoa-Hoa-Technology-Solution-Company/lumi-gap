import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

class AppTheme {
  static ThemeData get lightTheme => _build(LumiColors.light, Brightness.light);
  static ThemeData get darkTheme => _build(LumiColors.dark, Brightness.dark);

  static ThemeData _build(LumiColors c, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final text = AppTypography.textTheme(c.foreground);
    final onPrimaryText = AppTypography.textTheme(c.onPrimary);
    final radius8 = BorderRadius.circular(8);
    final radius12 = BorderRadius.circular(12);

    final scheme = ColorScheme(
      brightness: brightness,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primarySoft,
      onPrimaryContainer: c.primary,
      secondary: c.foregroundSecondary,
      onSecondary: c.surface,
      secondaryContainer: c.surfaceMuted,
      onSecondaryContainer: c.foreground,
      tertiary: c.success,
      onTertiary: c.surface,
      error: c.error,
      onError: c.onError,
      errorContainer: c.surfaceMuted,
      onErrorContainer: c.error,
      surface: c.surface,
      onSurface: c.foreground,
      onSurfaceVariant: c.muted,
      surfaceDim: c.background,
      surfaceBright: c.surface,
      surfaceContainerLowest: c.background,
      surfaceContainerLow: c.surface,
      surfaceContainer: c.surface,
      surfaceContainerHigh: c.surfaceMuted,
      surfaceContainerHighest: c.surfaceMuted,
      outline: c.line,
      outlineVariant: c.line,
      shadow: const Color(0xFF000000),
      scrim: c.scrim,
      inverseSurface: c.foreground,
      onInverseSurface: c.background,
      inversePrimary: c.primaryPressed,
      surfaceTint: Colors.transparent,
    );

    OutlineInputBorder border(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: radius8,
          borderSide: BorderSide(color: color, width: width),
        );

    final buttonShape = RoundedRectangleBorder(borderRadius: radius8);
    const buttonMin = Size(64, 48);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      fontFamily: AppTypography.fontFamily,
      colorScheme: scheme,
      textTheme: text,
      primaryTextTheme: onPrimaryText,
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      dividerColor: c.line,
      extensions: <ThemeExtension<dynamic>>[c],
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 64,
        titleTextStyle: text.headlineSmall,
        shape: Border(bottom: BorderSide(color: c.line)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 80,
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: c.primarySoft,
        indicatorShape: const StadiumBorder(),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return text.labelMedium!.copyWith(
            color: selected ? c.primary : c.muted,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? c.primary : c.muted, size: 24);
        }),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: radius8,
          side: BorderSide(color: c.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: buttonMin,
          shape: buttonShape,
          textStyle: text.labelLarge,
          backgroundColor: c.primary,
          foregroundColor: c.onPrimary,
          disabledBackgroundColor: c.surfaceMuted,
          // `muted` on `surfaceMuted` is the forbidden pair (4.35:1 in light).
          disabledForegroundColor: c.foregroundSecondary,
        ).copyWith(
          overlayColor: WidgetStatePropertyAll(
            c.primaryPressed.withValues(alpha: 0.16),
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: buttonMin,
          shape: buttonShape,
          elevation: 0,
          textStyle: text.labelLarge,
          backgroundColor: c.primary,
          foregroundColor: c.onPrimary,
          disabledBackgroundColor: c.surfaceMuted,
          disabledForegroundColor: c.foregroundSecondary,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: buttonMin,
          shape: buttonShape,
          textStyle: text.labelLarge,
          backgroundColor: c.surface,
          foregroundColor: c.foreground,
          disabledForegroundColor: c.muted,
          side: BorderSide(color: c.line),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: buttonMin,
          shape: buttonShape,
          textStyle: text.labelLarge,
          foregroundColor: c.primary,
          disabledForegroundColor: c.muted,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        floatingLabelBehavior: FloatingLabelBehavior.always,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        labelStyle: text.bodyMedium!.copyWith(
          color: c.foreground,
          fontWeight: FontWeight.w600,
        ),
        hintStyle: text.bodyLarge!.copyWith(color: c.muted),
        errorStyle: text.bodyMedium!.copyWith(color: c.error),
        border: border(c.line),
        enabledBorder: border(c.line),
        focusedBorder: border(c.focus, 2),
        errorBorder: border(c.error),
        focusedErrorBorder: border(c.error, 2),
        disabledBorder: border(c.line),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.surfaceMuted,
        selectedColor: c.primarySoft,
        disabledColor: c.surfaceMuted,
        labelStyle: text.labelMedium!.copyWith(color: c.foregroundSecondary),
        secondaryLabelStyle: text.labelMedium!.copyWith(color: c.primary),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.foreground,
        contentTextStyle: text.bodyMedium!.copyWith(color: c.background),
        actionTextColor: isDark ? c.primaryPressed : c.primarySoft,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: radius8),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        showDragHandle: true,
        dragHandleColor: c.line,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: radius12,
          side: BorderSide(color: c.line),
        ),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyLarge,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary),
      listTileTheme: ListTileThemeData(
        iconColor: c.foregroundSecondary,
        textColor: c.foreground,
        minVerticalPadding: 8,
      ),
      iconTheme: IconThemeData(color: c.foregroundSecondary),
    );
  }
}
