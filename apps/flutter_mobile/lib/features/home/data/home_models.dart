import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart'
    show YearlyCount;

// Hand-written, forgiving parsers for GET /home/overview and /home/research
// (shapes: packages/shared-types/src/home.ts). Unknown fields are ignored,
// unknown enum values fall back to `unknown`, and a malformed list item is
// skipped instead of failing the whole section.

typedef Json = Map<String, dynamic>;

String? _str(Object? v) {
  if (v is! String) return null;
  final t = v.trim();
  return t.isEmpty ? null : t;
}

int _int(Object? v, [int fallback = 0]) => v is num ? v.toInt() : fallback;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;

List<T> _items<T>(Object? raw, T? Function(Json json) parse) {
  if (raw is! List) return const [];
  final out = <T>[];
  for (final item in raw) {
    if (item is! Json) continue;
    try {
      final parsed = parse(item);
      if (parsed != null) out.add(parsed);
    } on Object catch (_) {
      // Skip a malformed item; the rest of the section still renders.
    }
  }
  return out;
}

T _enumByName<T extends Enum>(List<T> values, Object? raw, T fallback) {
  if (raw is String) {
    for (final v in values) {
      if (v.name == raw) return v;
    }
  }
  return fallback;
}

/// `{status: "ready", data}` or `{status: "unavailable", data: null}`.
/// Anything else (missing, wrong type, unparsable data) is unavailable, so a
/// bad section never breaks the page.
class HomeSection<T> {
  const HomeSection.ready(T this.data) : isReady = true;
  const HomeSection.unavailable() : isReady = false, data = null;

  factory HomeSection.parse(Object? json, T? Function(Object data) parseData) {
    if (json is! Json || json['status'] != 'ready') {
      return const HomeSection.unavailable();
    }
    final Object? raw = json['data'];
    if (raw == null) return const HomeSection.unavailable();
    try {
      final parsed = parseData(raw);
      return parsed == null
          ? const HomeSection.unavailable()
          : HomeSection.ready(parsed);
    } on Object catch (_) {
      return const HomeSection.unavailable();
    }
  }

  final bool isReady;
  final T? data;
}

enum HomeWorkflowStage {
  collection,
  screening,
  evidence,
  gaps,
  revision,
  unknown;

  /// English key; show with `context.t(stage.label)`.
  String get label => switch (this) {
    collection => tk('Collection'),
    screening => tk('Screening'),
    evidence => tk('Evidence'),
    gaps => tk('Gaps'),
    revision => tk('Revision'),
    unknown => tk('In progress'),
  };
}

enum HomeAttentionType {
  screening,
  evidence,
  revision,
  review,
  invitation,
  mentorship,
  contribution,
  unknown,
}

enum HomeRecommendationReason {
  interest,
  project,
  recent,
  unknown;

  /// English key; show with `context.t(reason.label)`.
  String get label => switch (this) {
    interest => tk('Based on your interests'),
    project => tk('Related to your projects'),
    recent => tk('Recently published'),
    unknown => tk('Suggested for you'),
  };
}

class HomeResearchWorkspace {
  const HomeResearchWorkspace({
    required this.id,
    required this.title,
    required this.stage,
    required this.href,
    this.researchField,
    this.updatedAt,
    this.paperCount = 0,
    this.screenedCount = 0,
    this.candidateGapCount = 0,
  });

  static HomeResearchWorkspace? fromJson(Json j) {
    final id = _str(j['id']);
    final title = _str(j['title']);
    if (id == null || title == null) return null;
    return HomeResearchWorkspace(
      id: id,
      title: title,
      researchField: _str(j['researchField']),
      stage: _enumByName(
        HomeWorkflowStage.values,
        j['stage'],
        HomeWorkflowStage.unknown,
      ),
      href: _str(j['href']) ?? '/projects/$id',
      updatedAt: _date(j['updatedAt']),
      paperCount: _int(j['paperCount']),
      screenedCount: _int(j['screenedCount']),
      candidateGapCount: _int(j['candidateGapCount']),
    );
  }

  final String id;
  final String title;
  final String? researchField;
  final HomeWorkflowStage stage;
  final String href;
  final DateTime? updatedAt;
  final int paperCount;
  final int screenedCount;
  final int candidateGapCount;
}

class HomeAttentionItem {
  const HomeAttentionItem({
    required this.id,
    required this.type,
    required this.title,
    required this.href,
    required this.priority,
    this.description,
    this.count,
    this.occurredAt,
  });

  static HomeAttentionItem? fromJson(Json j) {
    final id = _str(j['id']);
    final title = _str(j['title']);
    if (id == null || title == null) return null;
    return HomeAttentionItem(
      id: id,
      type: _enumByName(
        HomeAttentionType.values,
        j['type'],
        HomeAttentionType.unknown,
      ),
      title: title,
      description: _str(j['description']),
      count: j['count'] is num ? _int(j['count']) : null,
      href: _str(j['href']) ?? '/projects',
      occurredAt: _date(j['occurredAt']),
      priority: _int(j['priority']),
    );
  }

  final String id;
  final HomeAttentionType type;
  final String title;
  final String? description;
  final int? count;
  final String href;
  final DateTime? occurredAt;

  /// Higher number = more urgent (the backend orders `priority DESC`).
  final int priority;
}

/// Most urgent first (higher `priority`), then most recent `occurredAt`,
/// then `id` so equal items keep a stable order. Items without a date sort
/// after dated ones.
List<HomeAttentionItem> sortAttention(Iterable<HomeAttentionItem> items) {
  final sorted = items.toList()
    ..sort((a, b) {
      final byPriority = b.priority.compareTo(a.priority);
      if (byPriority != 0) return byPriority;
      final da = a.occurredAt;
      final db = b.occurredAt;
      if (da != null && db != null) {
        final byDate = db.compareTo(da);
        if (byDate != 0) return byDate;
      } else if (da != null) {
        return -1;
      } else if (db != null) {
        return 1;
      }
      return a.id.compareTo(b.id);
    });
  return sorted;
}

class HomeRecommendedPaper {
  const HomeRecommendedPaper({
    required this.id,
    required this.title,
    required this.authors,
    required this.reason,
    this.reasonLabel,
    this.venue,
    this.year,
  });

  static HomeRecommendedPaper? fromJson(Json j) {
    final id = _str(j['id']);
    final title = _str(j['title']);
    if (id == null || title == null) return null;
    return HomeRecommendedPaper(
      id: id,
      title: title,
      authors: _authorNames(j['authors']),
      venue: _str(j['venue']),
      year: j['year'] is num ? _int(j['year']) : null,
      reason: _enumByName(
        HomeRecommendationReason.values,
        j['reason'],
        HomeRecommendationReason.unknown,
      ),
      reasonLabel: _str(j['reasonLabel']),
    );
  }

  final String id;
  final String title;
  final List<String> authors;
  final String? venue;
  final int? year;
  final HomeRecommendationReason reason;

  /// Why it was suggested, from the API (the matching topic or field).
  final String? reasonLabel;

  /// Chip text: the API's `reasonLabel` when present, otherwise the English
  /// key of [reason] ("Based on your interests", ...), shown with `context.t`.
  String get chipText => reasonLabel ?? reason.label;
}

List<String> _authorNames(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final a in raw)
      if (a is String && a.trim().isNotEmpty)
        a.trim()
      else if (a is Json && _str(a['displayName'] ?? a['name']) != null)
        _str(a['displayName'] ?? a['name'])!,
  ];
}

/// "A, B, C et al." for more than three authors.
String formatAuthors(List<String> authors) => authors.length > 3
    // i18n-ignore: "et al." is the citation convention in both languages
    ? '${authors.take(3).join(', ')} et al.'
    : authors.join(', ');

class HomeCommunityTopic {
  const HomeCommunityTopic({
    required this.id,
    required this.title,
    required this.href,
    required this.replyCount,
    this.community,
    this.occurredAt,
  });

  static HomeCommunityTopic? fromJson(Json j) {
    final id = _str(j['id']);
    final title = _str(j['title']);
    if (id == null || title == null) return null;
    return HomeCommunityTopic(
      id: id,
      title: title,
      href: _str(j['href']) ?? '/forum/$id',
      community: _str(j['community']),
      replyCount: _int(j['replyCount']),
      occurredAt: _date(j['occurredAt']),
    );
  }

  final String id;
  final String title;
  final String href;
  final String? community;
  final int replyCount;
  final DateTime? occurredAt;
}

class HomeWorkspaceData {
  const HomeWorkspaceData({
    required this.continueResearch,
    required this.attention,
  });

  final List<HomeResearchWorkspace> continueResearch;
  final List<HomeAttentionItem> attention;
}

/// GET /home/research. Each section succeeds or fails on its own.
class HomeResearchOverview {
  const HomeResearchOverview({
    required this.workspace,
    required this.recommendations,
    required this.communityActivity,
    this.userName,
  });

  factory HomeResearchOverview.fromJson(Json json) {
    final user = json['currentUser'];
    return HomeResearchOverview(
      userName: user is Json ? _str(user['name']) : null,
      workspace: HomeSection.parse(json['workspace'], (data) {
        if (data is! Json) return null;
        return HomeWorkspaceData(
          continueResearch: _items(
            data['continueResearch'],
            HomeResearchWorkspace.fromJson,
          ),
          attention: sortAttention(
            _items(data['attention'], HomeAttentionItem.fromJson),
          ),
        );
      }),
      recommendations: HomeSection.parse(
        json['recommendations'],
        (data) =>
            data is List ? _items(data, HomeRecommendedPaper.fromJson) : null,
      ),
      communityActivity: HomeSection.parse(
        json['communityActivity'],
        (data) =>
            data is List ? _items(data, HomeCommunityTopic.fromJson) : null,
      ),
    );
  }

  final String? userName;
  final HomeSection<HomeWorkspaceData> workspace;
  final HomeSection<List<HomeRecommendedPaper>> recommendations;
  final HomeSection<List<HomeCommunityTopic>> communityActivity;

  HomeSection<List<HomeAttentionItem>> get attentionSection => workspace.isReady
      ? HomeSection.ready(workspace.data!.attention)
      : const HomeSection.unavailable();

  HomeSection<List<HomeResearchWorkspace>> get continueSection =>
      workspace.isReady
      ? HomeSection.ready(workspace.data!.continueResearch)
      : const HomeSection.unavailable();
}

class HomeRecentPaper {
  const HomeRecentPaper({
    required this.id,
    required this.title,
    required this.authors,
    this.venue,
    this.year,
    this.citationCount = 0,
  });

  static HomeRecentPaper? fromJson(Json j) {
    final id = _str(j['id']);
    final title = _str(j['title']);
    if (id == null || title == null) return null;
    return HomeRecentPaper(
      id: id,
      title: title,
      authors: _authorNames(j['authors']),
      venue: _str(j['journalName'] ?? j['venue']),
      year: j['publicationYear'] is num ? _int(j['publicationYear']) : null,
      citationCount: _int(j['citationCount']),
    );
  }

  final String id;
  final String title;
  final List<String> authors;
  final String? venue;
  final int? year;
  final int citationCount;
}

/// GET /home/overview (public; guests get the same trends and papers).
/// Trend verdict from the API (`classification.verdict`, Mann-Kendall test on
/// the yearly share, same wording as the web). Unknown or missing values are
/// `insufficient`: we never invent a direction the API did not conclude.
enum TrendVerdict {
  rising,
  declining,
  stable,
  insufficient;

  static TrendVerdict parse(Object? raw) {
    if (raw is String) {
      for (final v in values) {
        if (v.name == raw) return v;
      }
    }
    return TrendVerdict.insufficient;
  }
}

class HomeTrendTopic {
  const HomeTrendTopic({
    required this.topic,
    required this.yearlyBreakdown,
    required this.verdict,
  });

  static HomeTrendTopic? fromJson(Json j) {
    final topic = _str(j['topic'] ?? j['topicName']);
    if (topic == null) return null;
    final classification = j['classification'];
    return HomeTrendTopic(
      topic: topic,
      yearlyBreakdown: _items(j['yearlyBreakdown'], YearlyCount.fromJson),
      verdict: TrendVerdict.parse(
        classification is Json ? classification['verdict'] : null,
      ),
    );
  }

  final String topic;
  final List<YearlyCount> yearlyBreakdown;
  final TrendVerdict verdict;
}

class HomeOverview {
  const HomeOverview({required this.topics, required this.recentPapers});

  factory HomeOverview.fromJson(Json json) {
    final trends = json['trends'];
    return HomeOverview(
      topics: trends is Json
          ? _items(trends['topics'], HomeTrendTopic.fromJson)
          : const [],
      recentPapers: _items(json['recentPapers'], HomeRecentPaper.fromJson),
    );
  }

  final List<HomeTrendTopic> topics;
  final List<HomeRecentPaper> recentPapers;
}
