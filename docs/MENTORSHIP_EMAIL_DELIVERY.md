# Mentorship email delivery

The email switch in Mentor Workspace saves the authenticated user's existing
`AcademicProfile.mentorshipEmailEnabled` preference. It is independent of whether
the lecturer accepts new teams. Turning it on does not replay old notifications
or send a confirmation email.

New invitations, lecturer offers, acceptance/decline decisions, clarification
requests, and mentorship termination use the existing transactional Notification
outbox, BullMQ notification worker, and SMTP mail service. Cancellation, expiry,
internal mentor suggestions, and position-allocation notices remain in-app only.

The worker checks the recipient's active account, verified primary email, and
current preference immediately before delivery. Withdrawn, expired, or already
processed invitations are skipped. Competing workers must claim the same pending
notification before sending. Definite SMTP failures can retry; an uncertain
delivery is retained as `UNCERTAIN` to avoid automatic duplicate email.

## Local setup

Configure the existing root `.env`, never a tracked secret file:

```dotenv
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=<provider SMTP host>
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<SMTP account>
SMTP_PASS=<provider app password or SMTP credential>
SMTP_FROM=<approved sender email>
```

For a provider using STARTTLS on port 587, set `SMTP_PORT=587` and
`SMTP_SECURE=false`. Restart the backend and notification worker after changing
environment values. The lightweight local launcher must include the
`notifications` worker. The recipient needs an actual mailbox, not a demo
`@lumigap.test` address.

The preferences API returns only the signed-in user's delivery readiness and
recipient address, never SMTP credentials. Settings show when email is off, when
SMTP is unconfigured, or when the account uses a reserved test domain. `READY`
means SMTP is configured; it is not an inbox-delivery receipt.

## Verification

1. Sign in with an active verified lecturer account using a real email address.
2. Enable email notifications; reload and confirm the preference persists.
3. Send a new mentorship invitation from an eligible project owner. The lecturer
   should receive the existing invitation email and open the exact invitation.
4. Accept or decline. Opted-in project recipients receive the decision email.
5. Turn email off and repeat with a new event. In-app notifications remain;
   the email is skipped, including if the preference changed while queued.
6. Check Notification `emailStatus` and `emailSentAt`. `SENT` means SMTP accepted
   the message. Check the actual recipient Inbox/Spam to confirm final receipt.

Targeted automated tests:

- Backend: `src/modules/projects/__tests__/mentorship-mail.service.test.ts`
- Web: `src/features/projects/__tests__/mentoring-preferences.test.tsx`
- Existing PostgreSQL workflow suite:
  `src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts`

Use only an isolated test database for the PostgreSQL suite. Unit tests mock mail
delivery and do not send email to real people.
