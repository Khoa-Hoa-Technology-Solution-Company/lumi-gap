import 'dart:async';

import 'package:flutter/material.dart';

/// How long an Undo stays on screen before the change is committed.
const undoWindow = Duration(seconds: 5);

/// A snackbar with Undo for a change that has not been sent yet (or can be
/// reversed). Exactly one of [onUndo] / [onCommit] runs, once:
/// - Undo tapped → [onUndo];
/// - anything else (timeout, swiped away, replaced by another snackbar)
///   → [onCommit].
///
/// With TalkBack on, Flutter keeps snackbars that have an action until they
/// are dismissed; the change then commits when the user dismisses it.
///
/// Pass a messenger captured before any `await`, so it is still valid when
/// the calling screen has closed.
///
/// Returns a function that commits at once and hides the snackbar (for a
/// screen that is closing); it does nothing once the change has settled.
VoidCallback showUndoSnackBar(
  ScaffoldMessengerState messenger, {
  required String message,
  required String undoLabel,
  required VoidCallback onUndo,
  required VoidCallback onCommit,
}) {
  var settled = false;
  var showing = true;
  void settle({required bool undo}) {
    if (settled) return;
    settled = true;
    undo ? onUndo() : onCommit();
  }

  // Snackbars queue. A pending Undo must not wait behind another one, so
  // the current snackbar is removed first, which commits its own change.
  messenger.removeCurrentSnackBar();
  final controller = messenger.showSnackBar(
    SnackBar(
      content: Text(message),
      duration: undoWindow,
      // A snackbar with an action stays until dismissed on newer Flutter
      // unless told otherwise; the window must close on its own.
      persist: false,
      action: SnackBarAction(
        label: undoLabel,
        onPressed: () => settle(undo: true),
      ),
    ),
  );
  unawaited(
    controller.closed.then(
      (reason) {
        showing = false;
        settle(undo: reason == SnackBarClosedReason.action);
      },
      // A messenger torn down mid-display still commits.
      onError: (Object _) {
        showing = false;
        settle(undo: false);
      },
    ),
  );
  return () {
    if (settled) return;
    settle(undo: false);
    // Not during the caller's dispose: the messenger rebuilds when a
    // snackbar leaves. Ours is still the current one while it shows,
    // because other snackbars queue behind it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (showing && messenger.mounted) messenger.hideCurrentSnackBar();
    });
  };
}
