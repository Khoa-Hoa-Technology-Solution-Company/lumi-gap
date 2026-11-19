import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final authApiProvider = Provider<AuthApi>((ref) {
  final client = ref.watch(apiClientProvider);
  return AuthApi(client);
});

class AuthApi {

  AuthApi(this._client);
  final ApiClient _client;

  Future<AuthResponse> login(LoginRequest request) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      ApiRoutes.authLogin,
      data: request.toJson(),
    );
    final data = (response.data ?? {})['data'] as Map<String, dynamic>;
    return AuthResponse.fromJson(data);
  }

  Future<AuthResponse> register(RegisterRequest request) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      ApiRoutes.authRegister,
      data: request.toJson(),
    );
    final data = (response.data ?? {})['data'] as Map<String, dynamic>;
    return AuthResponse.fromJson(data);
  }

  Future<void> logout(String refreshToken) async {
    await _client.dio.post<void>(
      ApiRoutes.authLogout,
      data: {'refreshToken': refreshToken},
    );
  }

  Future<User> updateAcademicProfile(AcademicProfileType academicProfileType) async {
    final response = await _client.dio.patch<Map<String, dynamic>>(
      ApiRoutes.authAcademicProfile,
      data: {'academicProfileType': academicProfileType.name},
    );
    final data = (response.data ?? {})['data'] as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> me() async {
    final response = await _client.dio.get<Map<String, dynamic>>(ApiRoutes.authMe);
    final data = (response.data ?? {})['data'] as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Backend answers 202 whether or not the email has an account.
  Future<void> forgotPassword(String email) async {
    await _client.dio.post<void>(
      ApiRoutes.authPasswordForgot,
      data: {'email': email.trim()},
    );
  }

  /// Re-sends the verification email (202, same rate limiter as forgot).
  Future<void> resendVerification(String email) async {
    await _client.dio.post<void>(
      ApiRoutes.authEmailResend,
      data: {'email': email.trim()},
    );
  }

  /// PATCH /auth/me. Only what is passed is changed. A new institution also
  /// updates the academic profile (backend); it cannot be cleared there.
  Future<User> updateProfile({
    String? institution,
    List<String>? researchInterests,
  }) async {
    final response = await _client.dio.patch<Map<String, dynamic>>(
      ApiRoutes.authMe,
      data: {
        'institution': ?institution,
        'researchInterests': ?researchInterests,
      },
    );
    final data = (response.data ?? {})['data'] as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// POST /auth/change-password. [currentPassword] is required by the API
  /// only when the account already has one (not for a Google-only account).
  /// On success every refresh token is revoked: this session ends too.
  Future<void> changePassword({
    required String newPassword,
    String? currentPassword,
  }) async {
    await _client.dio.post<void>(
      ApiRoutes.authChangePassword,
      data: {
        'currentPassword': ?currentPassword,
        'newPassword': newPassword,
      },
    );
  }
}
