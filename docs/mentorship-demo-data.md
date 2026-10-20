# Local mentorship demo data

Run from the repository root:

```sh
pnpm --filter backend db:seed:mentorship
```

Requires migrated PostgreSQL on a loopback host and a nonproduction environment.
The seed adds separate demo institutions, 12 accounts, and 3 private projects.
Existing accounts and projects are preserved. Rerunning preserves passwords,
profile edits, and mentorship decisions. It does not resend requests or emails.

A random password is printed for accounts newly created in that run. Save it
locally; it is not saved in the repository. Existing accounts keep their password.
All names are marked `(Demo)` and all emails use the reserved `lumigap.test` domain.
Verification statuses simulate local scenarios; these are fictitious identities.

## Accounts

| Email | Scenario |
| --- | --- |
| leader@lumigap.test | Student owner of the education project |
| member@lumigap.test | Member of all 3 projects |
| student.health@lumigap.test | Student owner of the healthcare project |
| researcher@lumigap.test | Researcher owner of the security project |
| mentor.ai@lumigap.test | Verified, available; AI, NLP, education; incoming invitation |
| mentor.health@lumigap.test | Verified, available; AI in healthcare; outgoing offer |
| mentor.data@lumigap.test | Verified, available; data science, machine learning, statistics |
| mentor.security@lumigap.test | Verified, available; cybersecurity; active mentorship |
| mentor.education@lumigap.test | Verified, available; education, qualitative research |
| mentor.sustainability@lumigap.test | Verified, available; environment, sustainability |
| lecturer.pending@lumigap.test | Unverified; excluded from mentor search |
| lecturer.unavailable@lumigap.test | Verified, unavailable; excluded from mentor search |

## Ready to try

- Education: `/projects/eae68736-a523-4914-8068-1e4cc3f68eea?tab=support`.
  Sign in as `mentor.ai` to accept the owner's invitation.
- Healthcare: `/projects/0ad2fd0e-e74e-42e1-84da-db6a0d395112?tab=support`.
  Sign in as `student.health` to accept the lecturer's offer.
- Security: `/projects/30c5ca08-bb1a-45f4-898d-fcef4e10f991?tab=support`.
  Sign in as `mentor.security` to inspect active mentor access.
- Sign in as `mentor.data` to discover the education and healthcare projects.
  Their visibility is private; only the approved mentor preview is discoverable.
- Sign in as `member` to browse mentors and suggest one to a project owner.

Pending requests initially expire after 7 days. Mentors are not project members.
Demo profiles disable mentorship emails, and the seed does not enqueue delivery.
