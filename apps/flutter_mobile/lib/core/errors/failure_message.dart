import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';

/// HTTP status of whatever an API call threw, or null when the request never
/// got an answer (no connection, timeout) or the error is not an API error.
int? failureStatus(Object error) {
  if (error is ApiException) return error.statusCode;
  if (error is DioException) {
    final inner = error.error;
    return error.response?.statusCode ??
        (inner is ApiException ? inner.statusCode : null);
  }
  return null;
}

bool isConnectionFailure(Object error) =>
    error is DioException &&
    failureStatus(error) == null &&
    (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout);

/// What to tell the user when a request failed, as an English key for
/// `context.t`. The server text is never shown: it is English only and is
/// written for developers.
String failureMessageKey(Object error) {
  if (isConnectionFailure(error)) {
    return tk('Could not connect. Check your network and try again.');
  }
  return switch (failureStatus(error)) {
    429 => tk('Too many attempts. Please try again later.'),
    403 => tk('You do not have permission to do this.'),
    404 => tk('This item no longer exists.'),
    400 || 422 => tk('Some details were not accepted. Check them and try again.'),
    _ => tk('Something went wrong. Please try again.'),
  };
}

final Random _secureRandom = Random.secure();

/// Random version-4 UUID. Sent as an idempotency key so that retrying a
/// "create" request the server already handled cannot create a second item.
String newIdempotencyKey() {
  final bytes = List<int>.generate(16, (_) => _secureRandom.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
