import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:intl/intl.dart';

/// Short relative time ("20 minutes ago" / "20 phút trước"). Future
/// timestamps (clock skew) read as "Just now"; anything older than a week
/// shows the date (dd/MM/yyyy in Vietnamese, "Nov 9, 2026" in English).
String relativeTime(DateTime time, AppLocale locale, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return translate('Just now', locale);
  if (diff.inMinutes < 60) {
    return translatePlural(
      diff.inMinutes,
      locale,
      one: '{{count}} minute ago',
      other: '{{count}} minutes ago',
    );
  }
  if (diff.inHours < 24) {
    return translatePlural(
      diff.inHours,
      locale,
      one: '{{count}} hour ago',
      other: '{{count}} hours ago',
    );
  }
  if (diff.inDays < 7) {
    return translatePlural(
      diff.inDays,
      locale,
      one: '{{count}} day ago',
      other: '{{count}} days ago',
    );
  }
  return formatShortDate(time, locale);
}

/// dd/MM/yyyy in Vietnamese (no intl data needed), "Nov 9, 2026" in English.
String formatShortDate(DateTime time, AppLocale locale) {
  final local = time.toLocal();
  if (locale == AppLocale.en) return DateFormat.yMMMd('en').format(local);
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year}';
}
