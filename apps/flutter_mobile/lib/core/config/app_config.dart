class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000/api/v1',
  );

  /// Origin of the web app, used to open links that have no mobile screen yet.
  /// Override with `--dart-define=WEB_ORIGIN=...` (no trailing slash).
  static const String webOrigin = String.fromEnvironment(
    'WEB_ORIGIN',
    defaultValue: 'https://lumigap.uk',
  );
}
