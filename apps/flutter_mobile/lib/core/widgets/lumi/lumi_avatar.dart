import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// Up to two initials of [name]: first letter of the first and of the last
/// word ("Tran Thi B" gives "TB"). An empty name gives "?".
String lumiInitials(String? name) {
  final words = (name ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  String first(String w) => String.fromCharCode(w.runes.first).toUpperCase();
  if (words.length == 1) return first(words.single);
  return first(words.first) + first(words.last);
}

/// Round avatar with the person's initials on `primarySoft`. Decorative: the
/// name is always shown next to it, so it is hidden from screen readers.
class LumiAvatar extends StatelessWidget {
  const LumiAvatar({required this.name, this.size = 40, super.key});

  final String? name;

  /// 32, 40 or 72.
  final double size;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final text = Theme.of(context).textTheme;
    final style = size >= 64
        ? text.headlineSmall
        : size >= 40
            ? text.titleSmall
            : text.labelMedium;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: lumi.primarySoft,
          shape: BoxShape.circle,
        ),
        // The circle has a fixed size, so the initials must not grow with
        // the system text scale.
        child: Text(
          lumiInitials(name),
          textScaler: TextScaler.noScaling,
          style: style?.copyWith(color: lumi.primary),
        ),
      ),
    );
  }
}
