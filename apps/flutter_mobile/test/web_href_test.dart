import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('mapWebHref', () {
    test('project paths map to /project/:id and drop web-only query', () {
      expect(mapWebHref('/projects/abc123'), '/project/abc123');
      expect(
        mapWebHref('/projects/abc123?tab=papers&screening=UNDECIDED'),
        '/project/abc123',
      );
      expect(mapWebHref('/projects/abc123?tab=gaps'), '/project/abc123');
      expect(
        mapWebHref('/projects/abc123?tab=contributions'),
        '/project/abc123',
      );
    });

    test('the project list (with or without fragment) is the Projects tab', () {
      expect(mapWebHref('/projects'), '/projects');
      expect(mapWebHref('/projects#project-invitations-title'), '/projects');
    });

    test('papers and reports', () {
      expect(mapWebHref('/papers/p-9'), '/paper/p-9');
      expect(mapWebHref('/reports/r-1'), '/report/r-1');
      expect(mapWebHref('/reports'), '/reports');
    });

    test('screens that exist under the same name', () {
      for (final name in [
        'trends',
        'gaps',
        'rankings',
        'notifications',
        'bookmarks',
      ]) {
        expect(mapWebHref('/$name'), '/$name');
      }
    });

    test('search keeps its query', () {
      expect(mapWebHref('/search'), '/search');
      expect(
        mapWebHref('/search?q=federated+learning'),
        '/search?q=federated+learning',
      );
    });

    test('root maps to Home', () {
      expect(mapWebHref('/'), '/');
    });

    test('ids are encoded so they cannot add path segments', () {
      expect(mapWebHref('/projects/a%2Fb'), '/project/a%2Fb');
    });

    test('web-only paths have no mobile route', () {
      expect(mapWebHref('/review-requests/77'), isNull);
      expect(mapWebHref('/reviews/88'), isNull);
      expect(mapWebHref('/academic-support'), isNull);
      expect(mapWebHref('/forum/my-post-slug'), isNull);
      expect(
        mapWebHref('/projects/abc/members'),
        isNull,
        reason: 'deeper path',
      );
      expect(mapWebHref('/papers'), isNull, reason: 'no paper list screen');
      expect(mapWebHref('/something/unknown'), isNull);
    });

    test('rejects anything that is not a plain same-site path', () {
      expect(mapWebHref(''), isNull);
      expect(mapWebHref('   '), isNull);
      expect(mapWebHref('projects/abc'), isNull, reason: 'relative');
      expect(mapWebHref('https://evil.example/projects/abc'), isNull);
      expect(mapWebHref('http://lumigap.uk/projects/abc'), isNull);
      expect(mapWebHref('//evil.example/projects/abc'), isNull);
      expect(mapWebHref(r'/\evil.example'), isNull);
      expect(mapWebHref('javascript:alert(1)'), isNull);
      expect(mapWebHref('/projects/a b'), isNull, reason: 'whitespace');
    });

    test('trims surrounding whitespace', () {
      expect(mapWebHref('  /projects/abc  '), '/project/abc');
    });
  });

  group('webUrlFor', () {
    test('joins the web origin and the path', () {
      expect(
        webUrlFor(
          '/review-requests/77',
        ).toString(),
        'https://lumigap.uk/review-requests/77',
      );
      expect(
        webUrlFor('/forum/s?x=1#top', origin: 'https://lumigap.uk/').toString(),
        'https://lumigap.uk/forum/s?x=1#top',
      );
    });

    test('never builds a URL for another host', () {
      for (final bad in [
        'https://evil.example/x',
        '//evil.example/x',
        r'/\evil.example',
        'evil.example',
        '',
      ]) {
        expect(
          webUrlFor(bad),
          isNull,
          reason: bad,
        );
      }
    });
  });

  group('shellTabRoutes', () {
    test('are the four root tabs', () {
      expect(shellTabRoutes, {'/', '/explore', '/projects', '/profile'});
    });
  });

  group('relativeTime (vi)', () {
    final now = DateTime.utc(2026, 11, 9, 12);
    test('minutes, hours, days, then a date', () {
      expect(relativeTime(now, AppLocale.vi, now: now), 'Vừa xong');
      expect(
        relativeTime(
          now.subtract(const Duration(seconds: 59)),
          AppLocale.vi,
          now: now,
        ),
        'Vừa xong',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(minutes: 20)),
          AppLocale.vi,
          now: now,
        ),
        '20 phút trước',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(minutes: 59)),
          AppLocale.vi,
          now: now,
        ),
        '59 phút trước',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(hours: 1)),
          AppLocale.vi,
          now: now,
        ),
        '1 giờ trước',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(hours: 23)),
          AppLocale.vi,
          now: now,
        ),
        '23 giờ trước',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(days: 2)),
          AppLocale.vi,
          now: now,
        ),
        '2 ngày trước',
      );
      expect(
        relativeTime(
          now.subtract(const Duration(days: 6)),
          AppLocale.vi,
          now: now,
        ),
        '6 ngày trước',
      );
      expect(
        relativeTime(
          DateTime(2026, 10, 25, 9),
          AppLocale.vi,
          now: DateTime(2026, 11, 9, 12),
        ),
        '25/10/2026',
      );
    });

    test('a timestamp in the future reads as just now', () {
      expect(
        relativeTime(now.add(const Duration(hours: 3)), AppLocale.vi, now: now),
        'Vừa xong',
      );
    });
  });
}
