import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';

/// Why forgot-password / resend-verification failed, in terms the UI can
/// explain. A 202 is never a failure: the backend answers 202 whether or not
/// the email has an account, so success must not reveal that.
enum RecoveryFailure { rateLimited, offline, invalidEmail, other }

extension RecoveryFailureMessage on RecoveryFailure {
  /// English key; show it with `context.t(failure.message)`.
  String get message => switch (this) {
        RecoveryFailure.rateLimited =>
          tk('Too many attempts. Please try again later.'),
        RecoveryFailure.offline =>
          tk('Could not connect. Check your network and try again.'),
        RecoveryFailure.invalidEmail => tk('Invalid email'),
        RecoveryFailure.other => tk('Something went wrong. Please try again.'),
      };
}

RecoveryFailure classifyRecoveryError(Object error) {
  var status = error is ApiException ? error.statusCode : null;
  if (error is DioException) {
    final inner = error.error;
    status ??= error.response?.statusCode ??
        (inner is ApiException ? inner.statusCode : null);
    if (status == null && _isConnectionProblem(error.type)) {
      return RecoveryFailure.offline;
    }
  }
  if (status == 429) return RecoveryFailure.rateLimited;
  if (status == 400 || status == 422) return RecoveryFailure.invalidEmail;
  return RecoveryFailure.other;
}

bool _isConnectionProblem(DioExceptionType type) =>
    type == DioExceptionType.connectionError ||
    type == DioExceptionType.connectionTimeout ||
    type == DioExceptionType.sendTimeout ||
    type == DioExceptionType.receiveTimeout;

final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Same rules as the Lovable prototype. Null means valid; otherwise an
/// English key to show with `context.t`.
String? validateRecoveryEmail(String value) {
  final v = value.trim();
  if (v.isEmpty) return tk('Please enter your email');
  if (!_emailPattern.hasMatch(v)) return tk('Invalid email');
  return null;
}
