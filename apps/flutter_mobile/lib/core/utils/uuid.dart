import 'dart:math';

final _secure = Random.secure();

/// A random (version 4) UUID, lower-case: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
/// with `y` in 8, 9, a, b. Pass a [random] only in tests.
String generateUuidV4([Random? random]) {
  final r = random ?? _secure;
  final bytes = List<int>.generate(16, (_) => r.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int from, int to) => bytes
      .sublist(from, to)
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
