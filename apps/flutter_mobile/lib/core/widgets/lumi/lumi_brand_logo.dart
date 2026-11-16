import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// The LumiGap wordmark, the same artwork the web app uses. Picks the light or
/// dark file from the current theme and falls back to plain text if the image
/// cannot be decoded.
class LumiBrandLogo extends StatelessWidget {
  const LumiBrandLogo({this.height = 56, super.key});

  final double height;

  static const String lightAsset = 'assets/branding/logo.png';
  static const String darkAsset = 'assets/branding/logo-dark.png';

  /// Width / height of the artwork (1412 x 384), so the box is reserved
  /// before the image is decoded and nothing jumps.
  static const double aspectRatio = 1412 / 384;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Semantics(
      label: 'LumiGap', // i18n-ignore: product name
      image: true,
      child: ExcludeSemantics(
        child: SizedBox(
          height: height,
          width: height * aspectRatio,
          child: Image.asset(
            isDark ? darkAsset : lightAsset,
            fit: BoxFit.contain,
            errorBuilder: (context, _, _) => Center(
              child: Text( // i18n-ignore: product name
                'LumiGap',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(color: context.lumi.primary),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
