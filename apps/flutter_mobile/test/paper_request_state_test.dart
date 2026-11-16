import 'package:flutter_mobile/features/papers/domain/paper_request_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  PaperRequestState of(String? p, [String? d]) =>
      PaperRequestState.of(paperStatus: p, dataStatus: d);

  test('every backend status has its own meaning', () {
    expect(of('pending'), PaperRequestState.pendingReview);
    expect(
      of('pending-requester-acceptance'),
      PaperRequestState.awaitingYourAcceptance,
    );
    expect(of('downloaded', 'active'), PaperRequestState.completed);
    expect(of('rejected', 'low-quality'), PaperRequestState.rejected);
  });

  test('"not-downloaded" is approved only once the paper is live', () {
    // A new request without a PDF starts as not-downloaded + draft.
    expect(of('not-downloaded', 'draft'), PaperRequestState.submittedNoPdf);
    expect(
      of('not-downloaded', 'active'),
      PaperRequestState.approvedAwaitingPdf,
    );
    // Never read as "downloaded" because the word contains it.
    expect(of('not-downloaded'), isNot(PaperRequestState.completed));
  });

  test('an unknown or missing status is said to be unknown, never guessed',
      () {
    expect(of(null, 'active'), PaperRequestState.unknown);
    expect(of('archived'), PaperRequestState.unknown);
  });

  test('the user is asked to act on a PDF to accept or a rejection', () {
    expect(PaperRequestState.awaitingYourAcceptance.needsYou, isTrue);
    expect(PaperRequestState.rejected.needsYou, isTrue);
    expect(PaperRequestState.pendingReview.needsYou, isFalse);
  });
}
