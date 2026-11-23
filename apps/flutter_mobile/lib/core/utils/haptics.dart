import 'package:flutter/services.dart';

/// The app's only haptic vocabulary. Haptics are punctuation: one per user
/// action, on the same frame as the visual change, never on scroll and never
/// the only feedback.
abstract final class Haptics {
  /// A long-press opened a menu, or a value snapped to a choice.
  static Future<void> select() => HapticFeedback.selectionClick();

  /// A swipe passed the point where letting go commits it.
  static Future<void> commit() => HapticFeedback.lightImpact();

  /// The user confirmed a destructive action.
  static Future<void> destructive() => HapticFeedback.mediumImpact();
}
