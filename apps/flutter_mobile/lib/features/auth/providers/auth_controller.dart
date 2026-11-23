import 'dart:async';
import 'dart:developer';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/core/storage/secure_token_store.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final authControllerProvider = NotifierProvider<AuthController, AsyncValue<User?>>(() {
  return AuthController();
});

final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authControllerProvider).value;
});

class AuthController extends Notifier<AsyncValue<User?>> {
  late final AuthApi _authApi;
  late final SecureTokenStore _tokenStore;

  @override
  AsyncValue<User?> build() {
    _authApi = ref.watch(authApiProvider);
    _tokenStore = const SecureTokenStore();
    
    // We can't do async build directly with Notifier, so we trigger an async init
    unawaited(Future.microtask(_initAuth));
    return const AsyncLoading();
  }

  Future<void> _initAuth() async {
    log('AuthController: _initAuth started');
    try {
      // Add a timeout to prevent hanging forever if secure storage is stuck
      final tokens = await _tokenStore.read().timeout(const Duration(seconds: 3));
      log('AuthController: token read result: ${tokens != null ? "found" : "null"}');
      if (tokens != null) {
        final user = await _authApi.me().timeout(const Duration(seconds: 10));
        log('AuthController: fetched user: ${user.email}');
        state = AsyncData(user);
      } else {
        state = const AsyncData(null);
      }
    } on Object catch (e, st) {
      log('AuthController: _initAuth error: $e');
      if (sessionRejected(e)) {
        // The server said the session is over: sign out for good.
        try {
          await _tokenStore.delete().timeout(const Duration(seconds: 2));
        } on Object catch (_) {}
        state = const AsyncData(null);
      } else {
        // Offline, a timeout or a server error says nothing about the
        // session: keep it, and let the start screen offer a retry rather
        // than signing the person out because the network was down.
        state = AsyncError(e, st);
      }
    }
    log('AuthController: _initAuth completed, state is ${state.value}');
  }

  /// Tries the start-up session check again (after "could not connect").
  Future<void> retryStartup() async {
    if (state.isLoading) return;
    state = const AsyncLoading();
    await _initAuth();
  }

  /// Signs in. Returns null on success (the router then leaves the auth
  /// screens by itself) or the reason it failed. On failure the state goes
  /// back to "signed out", never to an error state, so nothing else in the
  /// app has to know a sign-in was attempted.
  Future<AuthFailure?> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final response = await _authApi.login(LoginRequest(email: email, password: password));
      // Tokens first: screens opened by the redirect call the API at once.
      await _tokenStore.save(response.tokens);
      state = AsyncData(response.user);
      return null;
    } on Object catch (e) {
      log('AuthController: login failed: ${e.runtimeType}');
      state = const AsyncData(null);
      return classifyAuthError(e);
    }
  }

  /// Creates the account and signs it in, as the web app does: the register
  /// response already carries the session. There is no role choice here; the
  /// academic profile is filled in later from the profile.
  Future<AuthFailure?> register(String email, String password, String fullName) async {
    state = const AsyncLoading();
    try {
      final response = await _authApi.register(RegisterRequest(
        email: email,
        password: password,
        fullName: fullName,
      ));
      await _tokenStore.save(response.tokens);
      state = AsyncData(response.user);
      return null;
    } on Object catch (e) {
      log('AuthController: register failed: ${e.runtimeType}');
      state = const AsyncData(null);
      return classifyAuthError(e);
    }
  }

  /// Reloads /auth/me without going through [AsyncLoading], which would make
  /// the router redirect to the splash screen. Returns the fresh user, or null
  /// if the session changed while the request was in flight (logout, other
  /// account), in which case the result is discarded.
  Future<User?> refreshUser() async {
    final current = state.value;
    if (current == null) return null;
    final fresh = await ref.read(authApiProvider).me();
    if (state.value?.id != current.id) return null;
    state = AsyncData(fresh);
    return fresh;
  }

  /// Saves the profile and shows the saved user without a loading state.
  /// Ignored if the session changed meanwhile (logout, other account).
  Future<void> updateProfile({
    String? institution,
    List<String>? researchInterests,
  }) async {
    final current = state.value;
    if (current == null) return;
    final updated = await ref.read(authApiProvider).updateProfile(
          institution: institution,
          researchInterests: researchInterests,
        );
    if (state.value?.id != current.id) return;
    state = AsyncData(updated);
  }

  Future<void> logout() async {
    state = const AsyncLoading();
    try {
      final tokens = await _tokenStore.read();
      if (tokens != null) {
        await _authApi.logout(tokens.refreshToken);
      }
    } on Object catch (_) {}
    await _tokenStore.delete();
    state = const AsyncData(null);
  }
}

/// True when the server refused the stored session (401 / 403), the only
/// case in which start-up may drop it. The API client has already tried a
/// token refresh before a 401 gets here.
bool sessionRejected(Object error) {
  final status = switch (error) {
    DioException(:final response, :final error) =>
      response?.statusCode ?? (error is ApiException ? error.statusCode : null),
    ApiException(:final statusCode) => statusCode,
    _ => null,
  };
  return status == 401 || status == 403;
}
