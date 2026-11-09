import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';

/// Why forgot-password / resend-verification failed, in terms the UI can
/// explain. A 202 is never a failure: the backend answers 202 whether or not
/// the email has an account, so success must not reveal that.
enum RecoveryFailure { rateLimited, offline, invalidEmail, other }

extension RecoveryFailureMessage on RecoveryFailure {
  String get message => switch (this) {
        RecoveryFailure.rateLimited =>
          'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.',
        RecoveryFailure.offline =>
          'Không kết nối được. Kiểm tra mạng rồi thử lại.',
        RecoveryFailure.invalidEmail => 'Email không hợp lệ',
        RecoveryFailure.other => 'Đã có lỗi xảy ra. Vui lòng thử lại.',
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

/// Same rules and wording as the Lovable prototype. Null means valid.
String? validateRecoveryEmail(String value) {
  final v = value.trim();
  if (v.isEmpty) return 'Vui lòng nhập email';
  if (!_emailPattern.hasMatch(v)) return 'Email không hợp lệ';
  return null;
}
