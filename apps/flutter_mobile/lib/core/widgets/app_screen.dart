import 'package:flutter/material.dart';

class AppScreen extends StatelessWidget {

  const AppScreen({
    required this.body,
    super.key,
    this.title,
    this.floatingActionButton,
    this.actions,
    this.showBackButton = true,
    this.bottomNavigationBar,
    this.padding = true,
  });
  final String? title;
  final Widget body;
  final Widget? floatingActionButton;
  final List<Widget>? actions;
  final bool showBackButton;
  final Widget? bottomNavigationBar;
  final bool padding;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: title != null
          ? AppBar(
              title: Text(title!),
              automaticallyImplyLeading: showBackButton,
              actions: actions,
              elevation: 0,
            )
          : null,
      body: SafeArea(
        child: padding
            ? Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: body,
              )
            : body,
      ),
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}
