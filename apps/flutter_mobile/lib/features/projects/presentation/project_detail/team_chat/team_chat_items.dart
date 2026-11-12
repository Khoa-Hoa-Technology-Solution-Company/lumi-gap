import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/features/projects/data/team_chat_models.dart';
import 'package:flutter_mobile/features/projects/providers/team_chat_controller.dart';

/// Messages from the same person this close together read as one group.
const teamChatGroupGap = Duration(minutes: 5);

sealed class TeamChatItem {
  const TeamChatItem();
}

/// "Hôm nay", "Hôm qua" or `dd/MM/yyyy` between two days.
class TeamChatDayItem extends TeamChatItem {
  const TeamChatDayItem(this.label);
  final String label;
}

class TeamChatMessageItem extends TeamChatItem {
  const TeamChatMessageItem({
    required this.message,
    required this.mine,
    required this.startsGroup,
    required this.showSeen,
  });

  final TeamChatMessage message;
  final bool mine;

  /// First message of a run from the same person: shows the name and avatar.
  final bool startsGroup;

  /// This is my last (not deleted) message and nothing of mine is still
  /// sending after it: "Đã xem bởi N" goes under it.
  final bool showSeen;
}

class TeamChatPendingItem extends TeamChatItem {
  const TeamChatPendingItem({required this.pending, required this.startsGroup});

  final PendingTeamMessage pending;
  final bool startsGroup;
}

String teamChatDayLabel(DateTime day, DateTime now, AppLocale locale) {
  final d = DateTime(day.year, day.month, day.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(d).inDays;
  if (diff == 0) return translate('Today', locale);
  if (diff == 1) return translate('Yesterday', locale);
  return formatShortDate(d, locale);
}

/// Chronological list for the chat: day separators, grouped messages, then
/// the messages that are still being sent (always last). [messages] must
/// already be sorted oldest first (the controller does that).
List<TeamChatItem> buildTeamChatItems({
  required List<TeamChatMessage> messages,
  required List<PendingTeamMessage> pending,
  required String? myId,
  required DateTime now,
  required AppLocale locale,
}) {
  final items = <TeamChatItem>[];
  TeamChatMessage? previous;
  DateTime? previousDay;

  // My last message that still shows its content and is not followed by an
  // unsent one.
  String? seenId;
  if (pending.isEmpty && myId != null) {
    for (final m in messages.reversed) {
      if (m.sender.id == myId && !m.isDeleted) {
        seenId = m.id;
        break;
      }
    }
  }

  for (final message in messages) {
    final local = message.createdAt.toLocal();
    final day = DateTime(local.year, local.month, local.day);
    final newDay = previousDay != day;
    if (newDay) items.add(TeamChatDayItem(teamChatDayLabel(local, now, locale)));
    final startsGroup =
        newDay ||
        previous == null ||
        previous.sender.id != message.sender.id ||
        message.createdAt.difference(previous.createdAt) > teamChatGroupGap;
    items.add(
      TeamChatMessageItem(
        message: message,
        mine: myId != null && message.sender.id == myId,
        startsGroup: startsGroup,
        showSeen: message.id == seenId,
      ),
    );
    previous = message;
    previousDay = day;
  }

  var previousIsMine =
      items.isNotEmpty &&
      items.last is TeamChatMessageItem &&
      (items.last as TeamChatMessageItem).mine;
  for (final p in pending) {
    items.add(TeamChatPendingItem(pending: p, startsGroup: !previousIsMine));
    previousIsMine = true;
  }
  return items;
}

/// The newest message from someone else that is still shown (the one to mark
/// as read), or null.
TeamChatMessage? latestFromOthers(
  List<TeamChatMessage> messages,
  String? myId,
) {
  for (final m in messages.reversed) {
    if (m.sender.id != myId && !m.isDeleted) return m;
  }
  return null;
}
