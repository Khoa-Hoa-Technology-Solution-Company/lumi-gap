import 'package:flutter/material.dart';

class AppLoading extends StatelessWidget {

  const AppLoading({
    super.key,
    this.message,
    this.fullScreen = false,
  });
  final String? message;
  final bool fullScreen;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const CircularProgressIndicator(),
        if (message != null) ...[
          const SizedBox(height: 16),
          Text(
            message!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ]
      ],
    );

    if (fullScreen) {
      return Center(child: content);
    }

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(child: content),
    );
  }
}
