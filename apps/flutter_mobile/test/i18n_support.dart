import 'package:flutter_mobile/core/i18n/i18n.dart';

/// [key] in Vietnamese. For checking code that returns an English key
/// (messages and labels shown through `context.t`).
String vi(String key, [Map<String, Object?>? args]) =>
    translate(key, AppLocale.vi, args);
