import 'dart:convert';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureTokenStore {

  const SecureTokenStore([
    this._storage = const FlutterSecureStorage(),
  ]);
  final FlutterSecureStorage _storage;

  static const _keyTokens = 'auth_tokens';

  Future<void> save(AuthTokens tokens) async {
    final jsonString = jsonEncode(tokens.toJson());
    await _storage.write(key: _keyTokens, value: jsonString);
  }

  Future<AuthTokens?> read() async {
    final jsonString = await _storage.read(key: _keyTokens);
    if (jsonString == null) return null;
    try {
      final map = jsonDecode(jsonString) as Map<String, dynamic>;
      return AuthTokens.fromJson(map);
    } on Object catch (_) {
      return null;
    }
  }

  Future<void> delete() async {
    await _storage.delete(key: _keyTokens);
  }
}
