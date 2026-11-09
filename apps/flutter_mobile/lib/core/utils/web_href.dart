import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/config/app_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

/// Root tabs live in the shell: reach them with `go`, never `push`.
const shellTabRoutes = {'/', '/explore', '/projects', '/profile'};

/// Maps a **web** path from the API (for example `/projects/42?tab=papers`)
/// to the matching **mobile** route, or null when mobile has no such screen
/// (then the link should open in the browser, see [webUrlFor]).
///
/// Only same-site paths are mapped: absolute URLs, protocol-relative
/// (`//host`) and anything that is not a plain `/path` return null.
String? mapWebHref(String href) {
  final uri = _parseSitePath(href);
  if (uri == null) return null;
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();

  if (segments.isEmpty) return '/';
  String id(String raw) => Uri.encodeComponent(raw);

  switch (segments[0]) {
    case 'projects':
      if (segments.length == 1) return '/projects';
      if (segments.length == 2) return '/project/${id(segments[1])}';
    case 'papers':
      if (segments.length == 2) return '/paper/${id(segments[1])}';
    case 'reports':
      if (segments.length == 1) return '/reports';
      if (segments.length == 2) return '/report/${id(segments[1])}';
    case 'trends' || 'gaps' || 'rankings' || 'notifications' || 'bookmarks':
      if (segments.length == 1) return '/${segments[0]}';
    case 'search':
      if (segments.length == 1) {
        return uri.hasQuery ? '/search?${uri.query}' : '/search';
      }
  }
  return null;
}

/// Full web URL for [href], or null if it is not a plain same-site path
/// (we never open arbitrary hosts supplied by the API).
Uri? webUrlFor(String href, {String origin = AppConfig.webOrigin}) {
  if (_parseSitePath(href) == null) return null;
  final base = origin.endsWith('/')
      ? origin.substring(0, origin.length - 1)
      : origin;
  return Uri.tryParse('$base$href');
}

Uri? _parseSitePath(String href) {
  final value = href.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.contains(r'\') || value.contains(RegExp(r'[\s\u0000-\u001f]'))) {
    return null;
  }
  final uri = Uri.tryParse(value);
  if (uri == null || uri.hasScheme || uri.hasAuthority) return null;
  return uri;
}

typedef UrlOpener = Future<bool> Function(Uri uri);

final urlOpenerProvider = Provider<UrlOpener>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Opens a web [href]: the mobile screen when one exists, otherwise the web
/// page in the browser. Shows a snackbar when neither is possible.
Future<void> openWebHref(
  BuildContext context,
  WidgetRef ref,
  String href,
) async {
  final route = mapWebHref(href);
  if (route != null) {
    final path = Uri.parse(route).path;
    if (shellTabRoutes.contains(path)) {
      context.go(route);
    } else {
      await context.push<void>(route);
    }
    return;
  }

  final url = webUrlFor(href);
  var opened = false;
  if (url != null) {
    try {
      opened = await ref.read(urlOpenerProvider)(url);
    } on Object catch (_) {
      opened = false;
    }
  }
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Không mở được liên kết.')),
    );
  }
}
