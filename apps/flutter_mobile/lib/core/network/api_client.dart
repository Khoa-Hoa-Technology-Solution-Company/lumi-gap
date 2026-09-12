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

    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 120),
      receiveTimeout: const Duration(seconds: 120),
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final tokens = await _tokenStore.read();
        if (tokens != null && tokens.accessToken.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
        }
        return handler.next(options);
      },
      onError: (e, handler) async {
        // Handle 401 Unauthorized
        if (e.response?.statusCode == 401 && !e.requestOptions.path.contains('/auth/refresh')) {
          final tokens = await _tokenStore.read();
          if (tokens != null && tokens.refreshToken.isNotEmpty) {
            try {
              final newAccessToken = await _refreshAccessToken(tokens.refreshToken);
              if (newAccessToken != null) {
                // Retry original request
                final opts = Options(
                  method: e.requestOptions.method,
                  headers: e.requestOptions.headers,
                );
                opts.headers?['Authorization'] = 'Bearer $newAccessToken';
                final cloneReq = await _dio.request<dynamic>(
                  e.requestOptions.path,
                  options: opts,
                  data: e.requestOptions.data,
                  queryParameters: e.requestOptions.queryParameters,
                );
                return handler.resolve(cloneReq);
              }
            } on Exception {
              await _tokenStore.delete();
              // In UI logic, this will trigger router redirect since token is gone.
            }
          }
        }

        // Parse backend errors into ApiException
        ApiErrorDetail? apiError;
        if (e.response?.data != null && e.response?.data is Map<String, dynamic>) {
          try {
            final data = e.response!.data as Map<String, dynamic>;
            if (data.containsKey('error')) {
              apiError = ApiErrorDetail.fromJson(data['error'] as Map<String, dynamic>);
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
    ));
  }
  late final Dio _dio;
  final SecureTokenStore _tokenStore;
  Future<String?>? _refreshFuture;

  Dio get dio => _dio;

  Future<String?> _refreshAccessToken(String refreshToken) async {
    if (_refreshFuture != null) {
      return _refreshFuture;
    }

    return _refreshFuture = () async {
      try {
        final response = await _dio.post<Map<String, dynamic>>(ApiRoutes.authRefresh, data: {
          'refreshToken': refreshToken,
        });
        
        final dataMap = (response.data ?? {})['data'] as Map<String, dynamic>;
        final tokens = AuthTokens.fromJson(dataMap);
        
        await _tokenStore.save(tokens);
        return tokens.accessToken;
      } on Exception {
        rethrow;
      } finally {
        _refreshFuture = null;
      }
    }();
  }
}
