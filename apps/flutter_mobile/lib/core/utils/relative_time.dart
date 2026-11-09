/// Short Vietnamese relative time ("20 phút trước"). Future timestamps (clock
/// skew) read as "Vừa xong"; anything older than a week shows the date.
String relativeTimeVi(DateTime time, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return 'Vừa xong';
  if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
  if (diff.inHours < 24) return '${diff.inHours} giờ trước';
  if (diff.inDays < 7) return '${diff.inDays} ngày trước';
  final local = time.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year}';
}
