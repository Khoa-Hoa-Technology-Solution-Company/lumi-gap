/// Reference-list citations of a paper, built only from what the paper has:
/// a missing journal, year or author is left out, never replaced by
/// "Unknown" or "N/A".
///
/// Names are written as the API gives them. Turning "Nguyen Van A" or
/// "Minh Nguyen" into "Surname, I." would guess the name order, so the
/// display name is kept as is.
library;

String _clean(String? s) => (s ?? '').trim();

/// Ends a part with exactly one period: a title that already ends in "?" or
/// "!" keeps its own mark.
String _sentence(String s) {
  if (s.isEmpty) return s;
  return RegExp(r'[.?!]$').hasMatch(s) ? s : '$s.';
}

List<String> _names(List<String> authors) =>
    [for (final a in authors) if (a.trim().isNotEmpty) a.trim()];

/// APA 7 reference: up to 20 authors joined with commas and "&" before the
/// last; from 21, the first 19, an ellipsis and the last one. No year is
/// "(n.d.)". Without authors the title takes their place.
String apaCitation({
  required List<String> authors,
  required String title,
  int? year,
  String? journal,
}) {
  final names = _names(authors);
  final when = year != null && year > 0 ? '($year).' : '(n.d.).';
  final t = _sentence(_clean(title));
  final j = _clean(journal);

  String people;
  if (names.isEmpty) {
    people = '';
  } else if (names.length == 1) {
    people = names.single;
  } else if (names.length <= 20) {
    people =
        '${names.sublist(0, names.length - 1).join(', ')}, & ${names.last}';
  } else {
    people = '${names.sublist(0, 19).join(', ')}, ... ${names.last}';
  }

  final parts = people.isEmpty
      ? [t, when, if (j.isNotEmpty) _sentence(j)]
      : [_sentence(people), when, t, if (j.isNotEmpty) _sentence(j)];
  return parts.where((p) => p.isNotEmpty).join(' ');
}

/// MLA 9 works-cited entry: one author, two joined with "and", three or more
/// as the first one and "et al.". Without authors the entry starts with the
/// title.
String mlaCitation({
  required List<String> authors,
  required String title,
  int? year,
  String? journal,
}) {
  final names = _names(authors);
  final t = _clean(title);
  final j = _clean(journal);
  final y = year != null && year > 0 ? '$year' : '';

  final people = switch (names.length) {
    0 => '',
    1 => names.single,
    // Names are shown as given, not inverted ("Last, First"), so MLA's
    // comma before "and" does not apply.
    2 => '${names[0]} and ${names[1]}',
    _ => '${names.first}, et al',
  };
  final quoted = t.isEmpty ? '' : '"${_sentence(t)}"';
  final container = [j, y].where((p) => p.isNotEmpty).join(', ');
  final parts = [
    if (people.isNotEmpty) _sentence(people),
    if (quoted.isNotEmpty) quoted,
    if (container.isNotEmpty) _sentence(container),
  ];
  return parts.join(' ');
}
