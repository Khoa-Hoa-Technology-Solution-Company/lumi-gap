import 'dart:convert';

import 'package:flutter/foundation.dart' show immutable;

/// One Server-Sent Event: the `event:` name (null if absent) and the `data:`
/// lines joined with `\n`.
@immutable
class SseEvent {
  const SseEvent({required this.data, this.event, this.id});

  final String data;
  final String? event;
  final String? id;

  @override
  bool operator ==(Object other) =>
      other is SseEvent &&
      other.data == data &&
      other.event == event &&
      other.id == id;

  @override
  int get hashCode => Object.hash(data, event, id);

  @override
  String toString() => 'SseEvent(event: $event, data: $data, id: $id)';
}

/// Incremental parser for the `text/event-stream` format.
///
/// Feed it decoded text in chunks of any size (an event, a line or even a
/// `\r\n` pair may be split between two chunks); it returns the events that
/// completed. Rules (WHATWG HTML, "Server-sent events"):
/// - lines end with `\n`, `\r\n` or `\r`;
/// - a line starting with `:` is a comment (heartbeats) and is ignored;
/// - `field: value` (one optional space after the colon); `data` lines of one
///   event are joined with `\n`;
/// - a blank line ends the event; an event without any `data:` is dropped;
/// - unknown fields (`retry`, anything else) are ignored.
class SseParser {
  String _partial = '';
  bool _lastWasCr = false;
  bool _firstChunk = true;
  final List<String> _data = [];
  String? _event;
  String? _id;

  List<SseEvent> feed(String chunk) {
    var text = chunk;
    if (_firstChunk && text.isNotEmpty) {
      _firstChunk = false;
      if (text.startsWith('﻿')) text = text.substring(1);
    }
    final out = <SseEvent>[];
    for (var i = 0; i < text.length; i++) {
      final c = text[i];
      if (c == '\n') {
        if (_lastWasCr) {
          // The second half of a `\r\n` already ended the line.
          _lastWasCr = false;
          continue;
        }
        _endLine(out);
      } else if (c == '\r') {
        _lastWasCr = true;
        _endLine(out);
      } else {
        _lastWasCr = false;
        _partial += c;
      }
    }
    return out;
  }

  void _endLine(List<SseEvent> out) {
    final line = _partial;
    _partial = '';
    if (line.isEmpty) {
      if (_data.isNotEmpty) {
        out.add(SseEvent(data: _data.join('\n'), event: _event, id: _id));
      }
      _data.clear();
      _event = null;
      return;
    }
    if (line.startsWith(':')) return;
    final colon = line.indexOf(':');
    final field = colon < 0 ? line : line.substring(0, colon);
    var value = colon < 0 ? '' : line.substring(colon + 1);
    if (value.startsWith(' ')) value = value.substring(1);
    switch (field) {
      case 'data':
        _data.add(value);
      case 'event':
        _event = value;
      case 'id':
        if (!value.contains('\u0000')) _id = value;
    }
  }
}

/// Turns a stream of raw bytes into events. UTF-8 sequences split between two
/// chunks are reassembled by the decoder before parsing.
Stream<SseEvent> parseSse(Stream<List<int>> bytes) async* {
  final parser = SseParser();
  await for (final text in bytes.cast<List<int>>().transform(utf8.decoder)) {
    for (final event in parser.feed(text)) {
      yield event;
    }
  }
}
