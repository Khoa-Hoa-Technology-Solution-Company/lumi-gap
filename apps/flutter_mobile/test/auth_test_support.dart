import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// What the backend does with a recovery request (all of them answer 202 on
/// success, so a "success" never says whether the email has an account).
typedef RecoveryHandler = Future<void> Function(String email);

/// Records every call; no network. Only the methods the tests need exist.
class FakeAuthApi extends Fake implements AuthApi {
  FakeAuthApi({this.onForgot, this.onResend, this.onMe});

  RecoveryHandler? onForgot;
  RecoveryHandler? onResend;
  Future<User> Function()? onMe;

  final List<String> forgotCalls = [];
  final List<String> resendCalls = [];
  int meCalls = 0;

  @override
  Future<void> forgotPassword(String email) async {
    forgotCalls.add(email);
    await onForgot?.call(email);
  }

  @override
  Future<void> resendVerification(String email) async {
    resendCalls.add(email);
    await onResend?.call(email);
  }

  @override
  Future<User> me() {
    meCalls++;
    return onMe!();
  }
}

/// A Dio failure shaped like the one `ApiClient` produces for an HTTP error.
DioException httpFailure(int status) {
  final options = RequestOptions(path: '/auth/password/forgot');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(requestOptions: options, statusCode: status),
    error: ApiException(message: 'HTTP $status', statusCode: status),
  );
}

DioException networkFailure() => DioException(
  requestOptions: RequestOptions(path: '/auth/password/forgot'),
  type: DioExceptionType.connectionError,
  error: 'SocketException',
);

User testUser({DateTime? verifiedAt, String id = 'u1'}) => User(
  id: id,
  email: 'minh@fpt.edu.vn',
  fullName: 'Minh Nguyen',
  createdAt: DateTime.utc(2026),
  emailVerifiedAt: verifiedAt,
);

/// Signed-in (or signed-out when the user is null) controller that never touches
/// secure storage or the network; keeps the real refreshUser.
class FakeAuthController extends AuthController {
  FakeAuthController(this._user);
  final User? _user;

  @override
  AsyncValue<User?> build() => AsyncData(_user);
}
