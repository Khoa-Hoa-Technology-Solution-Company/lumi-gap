import 'package:flutter/material.dart';

/// Raw palette, mirrors the web tokens (spec mobile-foundation §2.1).
/// Screens must not use these directly: read `Theme.of(context).colorScheme`
/// or `context.lumi` instead.
abstract final class LumiLight {
  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F5F9);
  static const Color line = Color(0xFFE2E8F0);
  static const Color foreground = Color(0xFF0F172A);
  static const Color foregroundSecondary = Color(0xFF475569);
  static const Color muted = Color(0xFF64748B);
  static const Color primary = Color(0xFF2563EB);
  static const Color primaryPressed = Color(0xFF1D4ED8);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primarySoft = Color(0xFFEFF6FF);
  static const Color error = Color(0xFFDC2626);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color success = Color(0xFF15803D);
  static const Color warning = Color(0xFFB45309);
  static const Color focus = Color(0xFF2563EB);
  static const Color scrim = Color(0x660F172A);
}

abstract final class LumiDark {
  static const Color background = Color(0xFF0B1120);
  static const Color surface = Color(0xFF131C31);
  static const Color surfaceMuted = Color(0xFF1E293B);
  static const Color line = Color(0xFF1E293B);
  static const Color foreground = Color(0xFFF1F5F9);
  static const Color foregroundSecondary = Color(0xFFCBD5E1);
  static const Color muted = Color(0xFF94A3B8);
  static const Color primary = Color(0xFF60A5FA);
  static const Color primaryPressed = Color(0xFF93C5FD);
  static const Color onPrimary = Color(0xFF0B1120);
  static const Color primarySoft = Color(0xFF172554);
  static const Color error = Color(0xFFF87171);
  static const Color onError = Color(0xFF0B1120);
  static const Color success = Color(0xFF4ADE80);
  static const Color warning = Color(0xFFFBBF24);
  static const Color focus = Color(0xFF60A5FA);
  static const Color scrim = Color(0x99000000);
}
