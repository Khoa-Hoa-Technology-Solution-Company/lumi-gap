import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// WCAG 2.1 relative luminance of an opaque colour.
double relativeLuminance(Color c) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/// WCAG contrast ratio of two opaque colours, 1 to 21.
double contrastRatio(Color a, Color b) {
  final la = relativeLuminance(a);
  final lb = relativeLuminance(b);
  final hi = math.max(la, lb);
  final lo = math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/// [top] painted over the opaque [bottom].
Color composite(Color top, Color bottom) {
  final a = top.a;
  return Color.from(
    alpha: 1,
    red: top.r * a + bottom.r * (1 - a),
    green: top.g * a + bottom.g * (1 - a),
    blue: top.b * a + bottom.b * (1 - a),
  );
}

/// The fill a render object paints behind its child, if any.
Color? _fillOf(RenderObject ro) {
  if (ro is RenderDecoratedBox &&
      ro.position == DecorationPosition.background) {
    final d = ro.decoration;
    if (d is BoxDecoration && d.color != null) return d.color;
    if (d is ShapeDecoration && d.color != null) return d.color;
  }
  if (ro is RenderPhysicalShape) return ro.color;
  if (ro is RenderPhysicalModel) return ro.color;
  // Private framework types with a public `color`: ColoredBox and the
  // Material ink layer.
  final name = ro.runtimeType.toString();
  if (name == '_RenderColoredBox' || name == '_RenderInkFeatures') {
    final Object? c = (ro as dynamic).color;
    return c is Color ? c : null;
  }
  return null;
}

/// What is actually behind [paragraph]: the fills of its ancestors, from the
/// page up, each blended over the one below.
Color backgroundOf(RenderObject paragraph, Color page) {
  final fills = <Color>[];
  var node = paragraph.parent;
  while (node != null) {
    final fill = _fillOf(node);
    if (fill != null && fill.a > 0) {
      fills.add(fill);
      if (fill.a >= 1) break;
    }
    node = node.parent;
  }
  var bg = page;
  for (final fill in fills.reversed) {
    bg = composite(fill, bg);
  }
  return bg;
}

void _colours(InlineSpan span, TextStyle? inherited, List<(String, TextStyle)> out) {
  if (span is! TextSpan) return;
  final style = inherited?.merge(span.style) ?? span.style;
  final text = span.text ?? '';
  if (style != null && style.color != null && text.trim().isNotEmpty) {
    out.add((text.trim(), style));
  }
  for (final child in span.children ?? const <InlineSpan>[]) {
    _colours(child, style, out);
  }
}

/// Text on screen that fails WCAG AA: below 4.5:1, or 3:1 for large text
/// (24px, or 18.66px bold). Text of a disabled control (alpha under 0.5)
/// is exempt, as WCAG exempts inactive components.
List<String> unreadableText(WidgetTester tester, {required Color page}) {
  final view = tester.view;
  final screen = Offset.zero &
      (view.physicalSize / view.devicePixelRatio);
  final problems = <String>[];
  for (final element in find.byType(RichText).evaluate()) {
    final ro = element.renderObject;
    if (ro is! RenderParagraph || !ro.attached || !ro.hasSize) continue;
    if (ro.size.isEmpty) continue;
    final rect = MatrixUtils.transformRect(
      ro.getTransformTo(null),
      Offset.zero & ro.size,
    );
    if (!rect.overlaps(screen)) continue;

    final spans = <(String, TextStyle)>[];
    _colours(ro.text, null, spans);
    if (spans.isEmpty) continue;
    final bg = backgroundOf(ro, page);
    for (final (text, style) in spans) {
      final fg = style.color!;
      if (fg.a < 0.5) continue;
      final size = style.fontSize ?? 14;
      final bold = (style.fontWeight?.value ?? 400) >= 700;
      final large = size >= 24 || (size >= 18.66 && bold);
      // An Icon is drawn as a glyph: WCAG 1.4.11 asks 3:1 of non-text.
      final icon = (style.fontFamily ?? '').contains('MaterialIcons');
      final need = large || icon ? 3.0 : 4.5;
      final ratio = contrastRatio(composite(fg, bg), bg);
      if (ratio + 0.005 < need) {
        String hex(Color c) => c.toARGB32().toRadixString(16).padLeft(8, '0');
        final shown = icon
            ? 'icon U+${text.runes.first.toRadixString(16)}'
            : text.length > 40
                ? '${text.substring(0, 40)}…'
                : text;
        problems.add(
          '"$shown" #${hex(fg)} on #${hex(bg)} = '
          '${ratio.toStringAsFixed(2)}:1 (needs $need)',
        );
      }
    }
  }
  return problems;
}
