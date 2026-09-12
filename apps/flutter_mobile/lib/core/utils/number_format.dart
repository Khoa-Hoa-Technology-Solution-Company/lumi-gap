import 'package:intl/intl.dart';

String formatNumber(num value) {
  return NumberFormat.decimalPattern('en_US').format(value);
}

String formatCompact(num value) {
  return NumberFormat.compact(locale: 'en_US').format(value);
}

String formatSigned(num value, [int decimalPlaces = 1]) {
  final sign = value >= 0 ? '+' : '';
  return '$sign${value.toStringAsFixed(decimalPlaces)}';
}
