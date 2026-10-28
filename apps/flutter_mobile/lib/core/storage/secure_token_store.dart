import 'dart:convert';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureTokenStore {
  const SecureTokenStore([
    this._storage = const FlutterSecureStorage(),
  ]);
  final FlutterSecureStorage _storage;

  static const _keyTokens = 'auth_tokens';
  static int _sessionVersion = 0;
  static Future<void> _pending = Future<void>.value();

  int get sessionVersion => _sessionVersion;

  // All instances use the same storage key. Serialize operations so a delayed
  // refresh write cannot finish after a newer sign-in or logout write.
  Future<T> _serialize<T>(Future<T> Function() operation) {
    final result = _pending.then((_) => operation());
    _pending = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }

  Future<void> save(AuthTokens tokens) {
    final version = ++_sessionVersion;
    return _serialize(() async {
      if (version == _sessionVersion) {
        await _storage.write(
          key: _keyTokens,
          value: jsonEncode(tokens.toJson()),
        );
      }
    });
  }

  Future<bool> saveForSession(AuthTokens tokens, int version) {
    return _serialize(() async {
      if (version != _sessionVersion) return false;
      await _storage.write(key: _keyTokens, value: jsonEncode(tokens.toJson()));
      return version == _sessionVersion;
    });
  }

  Future<AuthTokens?> read() => _serialize(_read);

  Future<AuthTokens?> _read() async {
    final jsonString = await _storage.read(key: _keyTokens);
    if (jsonString == null) return null;
    try {
      final map = jsonDecode(jsonString) as Map<String, dynamic>;
      return AuthTokens.fromJson(map);
    } on Object catch (_) {
      return null;
    }
  }

  Future<void> delete() {
    ++_sessionVersion;
    return _serialize(() => _storage.delete(key: _keyTokens));
  }

  Future<void> deleteForSession(int version) {
    if (version != _sessionVersion) return Future<void>.value();
    return delete();
  }
}
