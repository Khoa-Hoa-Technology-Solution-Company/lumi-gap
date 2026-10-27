import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/config/app_config.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/errors/api_exception.dart';
import 'package:flutter_mobile/core/network/api_envelope.dart';
import 'package:flutter_mobile/core/storage/secure_token_store.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(const SecureTokenStore());
});

class ApiClient {
  ApiClient(this._tokenStore) {
    const baseUrl = AppConfig.apiBaseUrl;

    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 120),
        receiveTimeout: const Duration(seconds: 120),
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final version =
              options.extra['_authSession'] as int? ??
              _tokenStore.sessionVersion;
          final tokens = await _tokenStore.read();
          if (version != _tokenStore.sessionVersion) {
            return handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.cancel,
                error: 'The original sign-in session has ended.',
              ),
            );
          }
          options.extra['_authSession'] = version;
          options.extra['_accessToken'] = tokens?.accessToken;
          if (tokens != null && tokens.accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
          }
          return handler.next(options);
        },
        onError: (e, handler) async {
          // Handle 401 Unauthorized
          final version = e.requestOptions.extra['_authSession'] as int?;
          final ownsSession =
              version != null && version == _tokenStore.sessionVersion;
          if (e.response?.statusCode == 401 &&
              ownsSession &&
              _isProtected(e.requestOptions)) {
            final tokens = await _tokenStore.read();
            if (version != _tokenStore.sessionVersion) return handler.next(e);
            if (tokens != null &&
                tokens.refreshToken.isNotEmpty &&
                e.requestOptions.extra['_authRetry'] != true) {
              e.requestOptions.extra['_authRetry'] = true;
              try {
                final newAccessToken =
                    tokens.accessToken != e.requestOptions.extra['_accessToken']
                    ? tokens.accessToken
                    : await _refreshAccessToken(tokens.refreshToken, version);
                if (version != _tokenStore.sessionVersion) {
                  return handler.next(e);
                }
                if (newAccessToken != null) {
                  e.requestOptions.headers['Authorization'] =
                      'Bearer $newAccessToken';
                  final data = e.requestOptions.data;
                  if (data is FormData) e.requestOptions.data = data.clone();
                  final cloneReq = await _dio.fetch<dynamic>(e.requestOptions);
                  return handler.resolve(cloneReq);
                }
              } on DioException catch (retryError) {
                // The retry interceptor handles its own 401. A transient failure
                // after refreshing must not delete a valid session.
                return handler.next(retryError);
              }
            }
            await _tokenStore.deleteForSession(version);
          }

          // Parse backend errors into ApiException
          ApiErrorDetail? apiError;
          if (e.response?.data != null &&
              e.response?.data is Map<String, dynamic>) {
            try {
              final data = e.response!.data as Map<String, dynamic>;
              if (data.containsKey('error')) {
                apiError = ApiErrorDetail.fromJson(
                  data['error'] as Map<String, dynamic>,
                );
              }
            } on Object catch (_) {
              // Ignore parse errors
            }
          }

          return handler.next(
            DioException(
              requestOptions: e.requestOptions,
              response: e.response,
              type: e.type,
              error: ApiException(
                message: apiError?.message ?? e.message ?? 'Unknown error',
                errorDetail: apiError,
                statusCode: e.response?.statusCode,
              ),
            ),
          );
        },
      ),
    );
  }
  late final Dio _dio;
  final SecureTokenStore _tokenStore;
  Future<String?>? _refreshFuture;
  int? _refreshVersion;

  Dio get dio => _dio;

  bool _isProtected(RequestOptions options) {
    return ![
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/oauth/exchange',
      '/auth/password/',
      '/auth/email/',
    ].any(options.path.contains);
  }

  Future<String?> _refreshAccessToken(String refreshToken, int version) async {
    if (_refreshFuture != null && _refreshVersion == version) {
      return _refreshFuture;
    }

    _refreshVersion = version;
    return _refreshFuture = () async {
      try {
        final response = await _dio.post<Map<String, dynamic>>(
          ApiRoutes.authRefresh,
          data: {
            'refreshToken': refreshToken,
          },
        );

        final dataMap = (response.data ?? {})['data'] as Map<String, dynamic>;
        final tokens = AuthTokens.fromJson(dataMap);

        return await _tokenStore.saveForSession(tokens, version)
            ? tokens.accessToken
            : null;
      } on Object {
        return null;
      } finally {
        if (_refreshVersion == version) _refreshFuture = null;
      }
    }();
  }
}
