import 'package:flutter_mobile/core/network/api_envelope.dart';

class ApiException implements Exception {

  ApiException({
    required this.message,
    this.errorDetail,
    this.statusCode,
  });
  final ApiErrorDetail? errorDetail;
  final String message;
  final int? statusCode;

  @override
  String toString() {
    if (errorDetail != null) {
      return 'ApiException: ${errorDetail!.message} (${errorDetail!.code})';
    }
    return 'ApiException: $message${statusCode != null ? ' (Status: $statusCode)' : ''}';
  }
}
