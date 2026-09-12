import 'package:flutter/material.dart';

class SwipeDeleteTile extends StatelessWidget {

  const SwipeDeleteTile({
    required this.child,
    required this.onDelete,
    required this.tileKey,
    super.key,
    this.confirmDelete,
    this.margin,
    this.borderRadius,
  });
  final Widget child;
  final VoidCallback onDelete;
  final Future<bool> Function()? confirmDelete;
  final Key tileKey;
  final EdgeInsetsGeometry? margin;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: borderRadius ?? BorderRadius.zero,
        child: Dismissible(
          key: tileKey,
          direction: DismissDirection.endToStart,
          confirmDismiss: (direction) async {
            if (confirmDelete != null) {
              return confirmDelete!();
            }
            return true;
          },
          onDismissed: (direction) {
            onDelete();
          },
          background: Container(
            color: theme.colorScheme.error,
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            child: Icon(
              Icons.delete_outline,
              color: theme.colorScheme.onError,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
