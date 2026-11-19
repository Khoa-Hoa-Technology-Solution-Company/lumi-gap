import 'dart:convert';

import 'package:flutter_mobile/features/projects/data/sse_parser.dart';
import 'package:flutter_test/flutter_test.dart';

List<SseEvent> parseAll(String text) => SseParser().feed(text);

Future<List<SseEvent>> parseBytes(List<List<int>> chunks) =>
    parseSse(Stream.fromIterable(chunks)).toList();

void main() {
  group('plain events', () {
    test('event name and one data line', () {
      final events = parseAll('event: ready\ndata: {"a":1}\n\n');
      expect(events, [const SseEvent(event: 'ready', data: '{"a":1}')]);
    });

    test('data without event name', () {
      expect(parseAll('data: hello\n\n'), [const SseEvent(data: 'hello')]);
    });

    test('several events in one chunk keep their order', () {
      final events = parseAll(
        'event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3\n\n',
      );
      expect(events.map((e) => '${e.event}:${e.data}'), ['a:1', 'b:2', 'c:3']);
    });

    test('only one space after the colon is dropped', () {
      expect(parseAll('data:no-space\n\n').single.data, 'no-space');
      expect(parseAll('data:  two\n\n').single.data, ' two');
    });

    test('a field with no colon is that field with an empty value', () {
      expect(parseAll('data\n\n'), [const SseEvent(data: '')]);
    });

    test('event name does not leak into the next event', () {
      final events = parseAll('event: a\ndata: 1\n\ndata: 2\n\n');
      expect(events[0].event, 'a');
      expect(events[1].event, isNull);
    });

    test('id is read, unknown fields are ignored', () {
      final events = parseAll('id: 7\nretry: 3000\nfoo: bar\ndata: x\n\n');
      expect(events.single, const SseEvent(data: 'x', id: '7'));
    });
  });

  group('data lines', () {
    test('multiple data lines are joined with a newline', () {
      expect(
        parseAll('data: line one\ndata: line two\ndata: three\n\n').single.data,
        'line one\nline two\nthree',
      );
    });

    test('an empty data line keeps its place', () {
      expect(parseAll('data: a\ndata:\ndata: b\n\n').single.data, 'a\n\nb');
    });
  });

  group('heartbeats and noise', () {
    test('comment lines are ignored, also inside an event', () {
      final events = parseAll(
        ': heartbeat 1699999999999\n\nevent: x\n: mid\ndata: ok\n\n',
      );
      expect(events, [const SseEvent(event: 'x', data: 'ok')]);
    });

    test('a heartbeat alone produces no event', () {
      expect(parseAll(': heartbeat 1\n\n: heartbeat 2\n\n'), isEmpty);
    });

    test('blank lines without data and events without data are dropped', () {
      expect(parseAll('\n\n\n'), isEmpty);
      expect(parseAll('event: lonely\n\n'), isEmpty);
    });

    test('an unknown event type is still delivered (callers decide)', () {
      expect(
        parseAll('event: mystery\ndata: {}\n\n').single.event,
        'mystery',
      );
    });

    test('a leading BOM is ignored', () {
      expect(parseAll('﻿data: hi\n\n').single.data, 'hi');
    });

    test('an unfinished event is not delivered', () {
      expect(parseAll('event: x\ndata: partial'), isEmpty);
      expect(parseAll('event: x\ndata: no blank line\n'), isEmpty);
    });
  });

  group('line endings', () {
    test('CRLF and CR also end lines', () {
      expect(parseAll('data: a\r\n\r\n').single.data, 'a');
      expect(parseAll('data: b\r\r').single.data, 'b');
      expect(parseAll('event: x\r\ndata: c\r\n\r\n').single.event, 'x');
    });

    test('CRLF split between two chunks is one line break, not two', () {
      final p = SseParser();
      final events = [
        ...p.feed('data: a\r'),
        ...p.feed('\ndata: b\r'),
        ...p.feed('\n\r'),
        ...p.feed('\n'),
      ];
      expect(events, [const SseEvent(data: 'a\nb')]);
    });
  });

  group('chunking', () {
    const wire =
        ': heartbeat 1\n\n'
        'event: ready\ndata: {"type":"ready"}\n\n'
        'event: message.created\ndata: {"type":"message.created","x":"a"}\n'
        'data: second line\n\n';

    List<SseEvent> expected() => parseAll(wire);

    test('the reference parse has the two expected events', () {
      expect(expected(), hasLength(2));
      expect(expected()[1].data, contains('second line'));
    });

    test('the same result for every possible split point', () {
      for (var cut = 0; cut <= wire.length; cut++) {
        final p = SseParser();
        final got = [
          ...p.feed(wire.substring(0, cut)),
          ...p.feed(wire.substring(cut)),
        ];
        expect(got, expected(), reason: 'cut at $cut');
      }
    });

    test('the same result when fed one character at a time', () {
      final p = SseParser();
      final got = <SseEvent>[];
      for (final c in wire.split('')) {
        got.addAll(p.feed(c));
      }
      expect(got, expected());
    });
  });

  group('bytes and UTF-8', () {
    const wire =
        'event: message.created\ndata: {"t":"Xin chào, bạn ơi 👋 日本語"}\n\n';
    final bytes = utf8.encode(wire);

    test('whole stream in one chunk', () async {
      final events = await parseBytes([bytes]);
      expect(events.single.data, '{"t":"Xin chào, bạn ơi 👋 日本語"}');
    });

    test(
      'a multi-byte character cut in the middle between two chunks',
      () async {
        // Cut at every byte offset, including inside "à", "ơ", the emoji (4
        // bytes) and the CJK characters (3 bytes).
        for (var cut = 1; cut < bytes.length; cut++) {
          final events = await parseBytes([
            bytes.sublist(0, cut),
            bytes.sublist(cut),
          ]);
          expect(events, hasLength(1), reason: 'cut at $cut');
          expect(
            events.single.data,
            '{"t":"Xin chào, bạn ơi 👋 日本語"}',
            reason: 'cut at $cut',
          );
          expect(events.single.event, 'message.created', reason: 'cut at $cut');
        }
      },
    );

    test('one byte per chunk', () async {
      final events = await parseBytes([
        for (final b in bytes) [b],
      ]);
      expect(events.single.data, '{"t":"Xin chào, bạn ơi 👋 日本語"}');
    });

    test('an empty stream and empty chunks give nothing', () async {
      expect(await parseBytes([]), isEmpty);
      expect(await parseBytes([[], []]), isEmpty);
    });

    test(
      'a stream that ends mid-event delivers only the complete ones',
      () async {
        final events = await parseBytes([utf8.encode('data: one\n\ndata: tw')]);
        expect(events.map((e) => e.data), ['one']);
      },
    );
  });
}
