import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'i18n_support.dart';

Map<String, dynamic> attention(
  String id, {
  int priority = 40,
  String? at = '2026-11-09T10:00:00.000Z',
  Object? type = 'screening',
}) => {
  'id': id,
  'type': type,
  'title': 'Việc $id',
  'description': 'Mô tả',
  'count': 3,
  'href': '/projects/p1?tab=papers',
  'occurredAt': at,
  'priority': priority,
};

Map<String, dynamic> workspace({Object? stage = 'screening'}) => {
  'id': 'p1',
  'title': 'Học liên kết',
  'researchField': 'Học máy',
  'stage': stage,
  'href': '/projects/p1?tab=papers',
  'updatedAt': '2026-11-08T00:00:00.000Z',
  'isOwner': true,
  'paperCount': 148,
  'screenedCount': 96,
  'awaitingScreening': 3,
  'includedCount': 10,
  'evidenceCount': 4,
  'papersWithEvidence': 2,
  'candidateGapCount': 4,
};

void main() {
  group('HomeSection.parse', () {
    test('ready with data', () {
      final s = HomeSection<List<int>>.parse(
        {
          'status': 'ready',
          'data': [1, 2],
        },
        (d) => (d as List).cast<int>(),
      );
      expect(s.isReady, isTrue);
      expect(s.data, [1, 2]);
    });

    test(
      'unavailable, missing, wrong type and null data are all unavailable',
      () {
        for (final json in <Object?>[
          {'status': 'unavailable', 'data': null},
          {'status': 'ready', 'data': null},
          {
            'status': 'weird',
            'data': [1],
          },
          {
            'data': [1],
          },
          'nope',
          null,
          42,
        ]) {
          final s = HomeSection<List<int>>.parse(
            json,
            (d) => (d as List).cast<int>(),
          );
          expect(s.isReady, isFalse, reason: '$json');
          expect(s.data, isNull);
        }
      },
    );

    test('data the parser cannot read makes only that section unavailable', () {
      final s = HomeSection<List<int>>.parse(
        {'status': 'ready', 'data': 'not a list'},
        (d) => (d as List).cast<int>(),
      );
      expect(s.isReady, isFalse);
    });
  });

  group('HomeResearchOverview.fromJson', () {
    test('full payload', () {
      final o = HomeResearchOverview.fromJson({
        'currentUser': {
          'id': 'u1',
          'name': 'Nguyễn Minh',
          'academicRole': 'STUDENT',
        },
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': [workspace()],
            'attention': [attention('a1')],
          },
        },
        'recommendations': {
          'status': 'ready',
          'data': [
            {
              'id': 'r1',
              'title': 'Paper',
              'authors': ['A', 'B'],
              'venue': 'ACL',
              'year': 2025,
              'reason': 'project',
              'reasonLabel': 'federated learning',
            },
          ],
        },
        'communityActivity': {
          'status': 'ready',
          'data': [
            {
              'id': 'c1',
              'title': 'Chủ đề',
              'href': '/forum/chu-de',
              'community': 'NLP',
              'replyCount': 18,
              'occurredAt': '2026-11-09T09:00:00.000Z',
              'reason': 'following',
            },
          ],
        },
      });

      expect(o.userName, 'Nguyễn Minh');
      expect(o.attentionSection.data!.single.title, 'Việc a1');
      final w = o.continueSection.data!.single;
      expect(w.stage, HomeWorkflowStage.screening);
      expect(w.paperCount, 148);
      expect(w.screenedCount, 96);
      expect(w.candidateGapCount, 4);
      expect(
        o.recommendations.data!.single.reason,
        HomeRecommendationReason.project,
      );
      expect(o.communityActivity.data!.single.replyCount, 18);
    });

    test('one unavailable section does not affect the others', () {
      final o = HomeResearchOverview.fromJson({
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': [workspace()],
            'attention': [attention('a1')],
          },
        },
        'recommendations': {'status': 'unavailable', 'data': null},
        'communityActivity': {'status': 'unavailable', 'data': null},
      });

      expect(o.workspace.isReady, isTrue);
      expect(o.attentionSection.isReady, isTrue);
      expect(o.continueSection.isReady, isTrue);
      expect(o.recommendations.isReady, isFalse);
      expect(o.communityActivity.isReady, isFalse);
    });

    test('unavailable workspace makes both of its sections unavailable', () {
      final o = HomeResearchOverview.fromJson({
        'workspace': {'status': 'unavailable', 'data': null},
        'recommendations': {'status': 'ready', 'data': <Object>[]},
        'communityActivity': {'status': 'ready', 'data': <Object>[]},
      });

      expect(o.attentionSection.isReady, isFalse);
      expect(o.continueSection.isReady, isFalse);
      expect(o.recommendations.isReady, isTrue);
      expect(o.recommendations.data, isEmpty);
    });

    test('an empty object parses to all-unavailable without throwing', () {
      final o = HomeResearchOverview.fromJson(const {});
      expect(o.userName, isNull);
      expect(o.workspace.isReady, isFalse);
      expect(o.recommendations.isReady, isFalse);
      expect(o.communityActivity.isReady, isFalse);
    });

    test('unknown enum values fall back, unknown fields are ignored', () {
      final o = HomeResearchOverview.fromJson({
        'brandNewField': 1,
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': [workspace(stage: 'teleporting')],
            'attention': [attention('a1', type: 'time-travel')],
          },
        },
        'recommendations': {
          'status': 'ready',
          'data': [
            {
              'id': 'r',
              'title': 'T',
              'authors': <Object>[],
              'year': 2024,
              'reason': 'vibes',
            },
          ],
        },
        'communityActivity': {'status': 'unavailable', 'data': null},
      });

      expect(o.continueSection.data!.single.stage, HomeWorkflowStage.unknown);
      expect(o.attentionSection.data!.single.type, HomeAttentionType.unknown);
      expect(
        o.recommendations.data!.single.reason,
        HomeRecommendationReason.unknown,
      );
    });

    test('malformed items are skipped, good ones kept', () {
      final o = HomeResearchOverview.fromJson({
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': [
              workspace(),
              'garbage',
              {'id': '', 'title': 'no id'},
              {'id': 'x'},
              null,
            ],
            'attention': [
              attention('ok'),
              {'id': 'bad', 'priority': 'high'},
              {'type': 'screening'},
            ],
          },
        },
        'recommendations': {
          'status': 'ready',
          'data': [
            1,
            'x',
            {'id': 'r1'},
          ],
        },
        'communityActivity': {
          'status': 'ready',
          'data': {'not': 'a list'},
        },
      });

      expect(o.continueSection.data, hasLength(1));
      expect(o.attentionSection.data!.map((a) => a.id), ['ok']);
      expect(o.recommendations.data, isEmpty);
      expect(o.communityActivity.isReady, isFalse);
    });

    test('missing counts default to 0 and optional text stays null', () {
      final o = HomeResearchOverview.fromJson({
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': [
              {'id': 'p', 'title': 'T', 'stage': 'gaps', 'href': '/projects/p'},
            ],
            'attention': <Object>[],
          },
        },
      });
      final w = o.continueSection.data!.single;
      expect(w.paperCount, 0);
      expect(w.screenedCount, 0);
      expect(w.candidateGapCount, 0);
      expect(w.researchField, isNull);
      expect(w.updatedAt, isNull);
    });
  });

  group('sortAttention', () {
    HomeAttentionItem item(String id, int priority, String? at) =>
        HomeAttentionItem.fromJson(attention(id, priority: priority, at: at))!;

    test('higher priority first, then most recent', () {
      final sorted = sortAttention([
        item('low-new', 10, '2026-11-09T12:00:00Z'),
        item('high-old', 90, '2026-11-01T00:00:00Z'),
        item('high-new', 90, '2026-11-09T00:00:00Z'),
        item('mid', 40, '2026-11-05T00:00:00Z'),
      ]);
      expect(sorted.map((e) => e.id), [
        'high-new',
        'high-old',
        'mid',
        'low-new',
      ]);
    });

    test('items without a date go after dated ones; ties break by id', () {
      final sorted = sortAttention([
        item('b', 40, null),
        item('a', 40, null),
        item('dated', 40, '2026-11-01T00:00:00Z'),
      ]);
      expect(sorted.map((e) => e.id), ['dated', 'a', 'b']);
    });

    test('empty and single item', () {
      expect(sortAttention(const []), isEmpty);
      expect(sortAttention([item('x', 1, null)]).single.id, 'x');
    });

    test('does not mutate its input', () {
      final input = [item('a', 1, null), item('b', 9, null)];
      sortAttention(input);
      expect(input.first.id, 'a');
    });

    test('fromJson sorts the attention list', () {
      final o = HomeResearchOverview.fromJson({
        'workspace': {
          'status': 'ready',
          'data': {
            'continueResearch': <Object>[],
            'attention': [
              attention('low', priority: 10),
              attention('high', priority: 90),
            ],
          },
        },
      });
      expect(o.attentionSection.data!.map((a) => a.id), ['high', 'low']);
    });
  });

  group('HomeOverview.fromJson', () {
    test('parses trend topics and recent papers', () {
      final o = HomeOverview.fromJson({
        'mode': 'user',
        'trends': {
          'topics': [
            {
              'topic': 'RAG',
              'momentum': 0.8,
              'growthRatePct': 42.5,
              'totalPapers': 120,
              'classification': {'verdict': 'rising'},
              'yearlyBreakdown': [
                {'year': 2024, 'count': 3},
                {'year': 2025, 'count': 8},
              ],
            },
          ],
        },
        'recentPapers': [
          {
            'id': 'p1',
            'title': 'Paper',
            'authors': [
              {'displayName': 'Nguyen T.'},
              {'displayName': 'Tran H.'},
            ],
            'journalName': 'Nature',
            'publicationYear': 2026,
            'citationCount': 7,
          },
        ],
      });

      expect(o.topics.single.topic, 'RAG');
      expect(o.topics.single.verdict, TrendVerdict.rising);
      expect(o.topics.single.yearlyBreakdown, hasLength(2));
      expect(o.recentPapers.single.authors, ['Nguyen T.', 'Tran H.']);
      expect(o.recentPapers.single.venue, 'Nature');
      expect(o.recentPapers.single.citationCount, 7);
    });

    test('missing trends or papers give empty lists', () {
      final o = HomeOverview.fromJson(const {'mode': 'guest'});
      expect(o.topics, isEmpty);
      expect(o.recentPapers, isEmpty);
    });

    test('bad entries are skipped', () {
      final o = HomeOverview.fromJson({
        'trends': {
          'topics': ['x', 3],
        },
        'recentPapers': [
          {'id': 'p1'},
          {'id': 'p2', 'title': 'Ok'},
        ],
      });
      expect(o.recentPapers.map((p) => p.id), ['p2']);
      expect(o.recentPapers.single.authors, isEmpty);
    });
  });

  group('TrendVerdict.parse', () {
    test('maps the four API verdicts', () {
      expect(TrendVerdict.parse('rising'), TrendVerdict.rising);
      expect(TrendVerdict.parse('declining'), TrendVerdict.declining);
      expect(TrendVerdict.parse('stable'), TrendVerdict.stable);
      expect(TrendVerdict.parse('insufficient'), TrendVerdict.insufficient);
    });

    test(
      'unknown, wrong type or missing is insufficient (never invent a direction)',
      () {
        for (final raw in <Object?>[
          'RISING',
          'up',
          '',
          3,
          null,
          true,
          <Object>[],
        ]) {
          expect(
            TrendVerdict.parse(raw),
            TrendVerdict.insufficient,
            reason: '$raw',
          );
        }
      },
    );
  });

  group('HomeTrendTopic.fromJson', () {
    Map<String, dynamic> topic(Object? classification) => {
      'topic': 'RAG',
      'growthRatePct': 400, // must NOT decide the label
      'yearlyBreakdown': [
        {'year': 2024, 'count': 1},
        {'year': 2025, 'count': 9},
      ],
      'classification': ?classification,
    };

    test('takes the label from classification.verdict, not from growth', () {
      for (final v in ['rising', 'declining', 'stable', 'insufficient']) {
        final t = HomeTrendTopic.fromJson(
          topic({'verdict': v, 'confidence': null}),
        )!;
        expect(t.verdict.name, v);
      }
      // 400% growth but the test concluded "stable": the API wins.
      expect(
        HomeTrendTopic.fromJson(topic({'verdict': 'stable'}))!.verdict,
        TrendVerdict.stable,
      );
    });

    test('missing or malformed classification is insufficient', () {
      expect(
        HomeTrendTopic.fromJson(topic(null))!.verdict,
        TrendVerdict.insufficient,
      );
      expect(
        HomeTrendTopic.fromJson(topic('rising'))!.verdict,
        TrendVerdict.insufficient,
      );
      expect(
        HomeTrendTopic.fromJson(topic(<String, Object?>{}))!.verdict,
        TrendVerdict.insufficient,
      );
      expect(
        HomeTrendTopic.fromJson(topic({'verdict': 'moon'}))!.verdict,
        TrendVerdict.insufficient,
      );
    });

    test('keeps the yearly counts and requires a topic name', () {
      final t = HomeTrendTopic.fromJson(topic({'verdict': 'rising'}))!;
      expect(t.topic, 'RAG');
      expect(t.yearlyBreakdown.map((y) => y.count), [1, 9]);
      expect(
        HomeTrendTopic.fromJson({
          'classification': {'verdict': 'rising'},
        }),
        isNull,
      );
      expect(HomeTrendTopic.fromJson({'topic': '  '}), isNull);
    });
  });

  group('HomeRecommendedPaper chip text', () {
    HomeRecommendedPaper paper({String? reason, Object? label}) =>
        HomeRecommendedPaper.fromJson({
          'id': 'r',
          'title': 'T',
          'authors': <Object>[],
          'reason': ?reason,
          'reasonLabel': ?label,
        })!;

    test('shows reasonLabel when the API sends one', () {
      expect(
        paper(reason: 'interest', label: 'federated learning').chipText,
        'federated learning',
      );
      expect(
        vi(paper(reason: 'project', label: ' Học máy ').chipText),
        'Học máy',
      );
    });

    test('derives it from reason when the label is missing or blank', () {
      expect(
        vi(paper(reason: 'interest').chipText),
        'Theo chủ đề bạn quan tâm',
      );
      expect(
        vi(paper(reason: 'project', label: '').chipText),
        'Liên quan dự án của bạn',
      );
      expect(
        vi(paper(reason: 'recent', label: '   ').chipText),
        'Mới xuất bản',
      );
      expect(vi(paper(reason: 'recent', label: 7).chipText), 'Mới xuất bản');
      expect(vi(paper(reason: 'mystery').chipText), 'Gợi ý cho bạn');
      expect(vi(paper().chipText), 'Gợi ý cho bạn');
    });
  });

  group('formatAuthors', () {
    test('lists up to three, then et al.', () {
      expect(formatAuthors([]), '');
      expect(formatAuthors(['A']), 'A');
      expect(formatAuthors(['A', 'B', 'C']), 'A, B, C');
      expect(formatAuthors(['A', 'B', 'C', 'D']), 'A, B, C et al.');
    });
  });
}
