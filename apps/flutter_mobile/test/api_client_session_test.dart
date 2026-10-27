import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/storage/secure_token_store.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) => respond(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _response(int status, [Object? data]) => ResponseBody.fromString(
  jsonEncode(data ?? <String, dynamic>{}),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);
const _initial = AuthTokens(
  accessToken: 'initial-access',
  refreshToken: 'initial-refresh',
);
const _rotated = AuthTokens(
  accessToken: 'rotated-access',
  refreshToken: 'rotated-refresh',
);
const _second = AuthTokens(
  accessToken: 'second-access',
  refreshToken: 'second-refresh',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const store = SecureTokenStore();
  late ApiClient client;

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await store.save(_initial);
    client = ApiClient(store);
  });
  tearDown(() async {
    client.dio.close(force: true);
    await store.delete();
  });

  test(
    'retries only once when refreshed credentials are still unauthorized',
    () async {
      var refreshes = 0;
      var requests = 0;
      client.dio.httpClientAdapter = _Adapter((options) async {
        if (options.path.endsWith('/auth/refresh')) {
          refreshes++;
          return _response(200, {'data': _rotated.toJson()});
        }
        requests++;
        return _response(401);
      });
      await expectLater(
        client.dio.get<dynamic>('/credits/balance'),
        throwsA(isA<DioException>()),
      );
      expect(refreshes, 1);
      expect(requests, 2);
      expect(await store.read(), isNull);
    },
  );

  test(
    'does not refresh or delete tokens for rejected login credentials',
    () async {
      var requests = 0;
      client.dio.httpClientAdapter = _Adapter((options) async {
        requests++;
        return _response(401);
      });
      await expectLater(
        client.dio.post<dynamic>('/auth/login'),
        throwsA(isA<DioException>()),
      );
      expect(requests, 1);
      expect(await store.read(), _initial);
    },
  );

  test(
    'rejects malformed refresh responses without leaving the request pending',
    () async {
      client.dio.httpClientAdapter = _Adapter((options) async {
        if (options.path.endsWith('/auth/refresh')) {
          return _response(200, {'data': null});
        }
        return _response(401);
      });
      await expectLater(
        client.dio.get<dynamic>('/credits/balance'),
        throwsA(isA<DioException>()),
      );
      expect(await store.read(), isNull);
    },
  );

  test('shares a refresh and preserves request options on retry', () async {
    final started = Completer<void>();
    final response = Completer<ResponseBody>();
    var refreshes = 0;
    client.dio.httpClientAdapter = _Adapter((options) async {
      if (options.path.endsWith('/auth/refresh')) {
        refreshes++;
        started.complete();
        return response.future;
      }
      if (options.headers['Authorization'] == 'Bearer rotated-access') {
        expect(options.queryParameters, {'page': 2});
        expect(options.responseType, ResponseType.json);
        return _response(200, {'success': true});
      }
      return _response(401);
    });
    final first = client.dio.get<dynamic>(
      '/credits/balance',
      queryParameters: {'page': 2},
    );
    final second = client.dio.get<dynamic>(
      '/credits/summary',
      queryParameters: {'page': 2},
    );
    await started.future;
    response.complete(_response(200, {'data': _rotated.toJson()}));
    expect(
      (await Future.wait([first, second])).map((value) => value.statusCode),
      [200, 200],
    );
    expect(refreshes, 1);
    expect(await store.read(), _rotated);
  });

  for (final logout in [true, false]) {
    test(
      'ignores a delayed refresh after ${logout ? 'logout' : 'account switch'}',
      () async {
        final started = Completer<void>();
        final response = Completer<ResponseBody>();
        var requests = 0;
        client.dio.httpClientAdapter = _Adapter((options) async {
          if (options.path.endsWith('/auth/refresh')) {
            started.complete();
            return response.future;
          }
          requests++;
          return _response(401);
        });
        final result = expectLater(
          client.dio.get<dynamic>('/credits/balance'),
          throwsA(isA<DioException>()),
        );
        await started.future;
        if (logout) {
          await store.delete();
        } else {
          await store.save(_second);
        }
        response.complete(_response(200, {'data': _rotated.toJson()}));
        await result;
        expect(await store.read(), logout ? isNull : _second);
        expect(requests, 1);
      },
    );
  }

  test('does not refresh an old request using the new account', () async {
    var requests = 0;
    client.dio.httpClientAdapter = _Adapter((options) async {
      requests++;
      await store.save(_second);
      return _response(401);
    });
    await expectLater(
      client.dio.get<dynamic>('/credits/balance'),
      throwsA(isA<DioException>()),
    );
    expect(requests, 1);
    expect(await store.read(), _second);
  });

  test(
    'keeps refreshed tokens when the retried request has a transient server error',
    () async {
      client.dio.httpClientAdapter = _Adapter((options) async {
        if (options.path.endsWith('/auth/refresh')) {
          return _response(200, {'data': _rotated.toJson()});
        }
        return _response(options.extra['_authRetry'] == true ? 500 : 401);
      });
      await expectLater(
        client.dio.get<dynamic>('/credits/balance'),
        throwsA(isA<DioException>()),
      );
      expect(await store.read(), _rotated);
    },
  );
}
