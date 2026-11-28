# Local Mentorship & Lecturer Workspace Demo Data

LumiGap provides two idempotent, development-only demo seeds for local testing and UX verification.

## 1. Quick Mentorship Seed (Baseline)

```sh
pnpm --filter backend db:seed:mentorship
```

Adds 3 demo institutions, 12 accounts, and 3 private projects for baseline mentorship discovery & invitation flows.

## 2. Comprehensive Lecturer Workspace Seed (Full Scenario Matrix)

```sh
pnpm --filter backend db:seed:lecturer-workspace
```

Requires migrated PostgreSQL on a loopback host (`localhost` / `127.0.0.1` / `[::1]`) and `NODE_ENV !== "production"`.

### Safety & Idempotency Guarantees
- Strictly disabled in production and on non-loopback databases.
- Uses deterministic UUIDs under namespace `lumigap-lecturer-workspace-demo-v2:` and reserved `@lumigap.test` emails.
- Every account and project is clearly labeled `(Demo)`.
- Reruns preserve existing real users, passwords, profile edits, and mentorship decisions without duplicating records.
- A random password is generated and printed **only** for newly created accounts during that run (never stored in git).
- Synthetic introductory PDFs are generated on the fly with `pdf-lib` (no real personal data or copyrighted documents).
- Mentorship email delivery is disabled for demo profiles.

### Representative Accounts (`db:seed:lecturer-workspace`)

| Email | Role & Verification | Scenarios Covered |
| --- | --- | --- |
| `lw.mentor.lead@lumigap.test` | Verified Lecturer (`acceptingMentorships: true`) | Primary mentor on flagship AI Education project, Secondary mentor on Cybersecurity, Incoming invitation (Medical LLM), Outgoing proposal (Environmental Data), Historical ended mentorship (Finance), Multi-round review (Round 1 submitted on v1 + Round 2 pending on v2), Contributions across all states (`Cần bạn phản hồi`, `Đang chờ nhóm xác nhận`, `Đã đối soát`, `Hệ thống ghi nhận`, historical preserved). |
| `lw.mentor.health@lumigap.test` | Verified Lecturer (`acceptingMentorships: true`) | Primary mentor on Medical LLM & EdTech projects. |
| `lw.mentor.fresh@lumigap.test` | Verified Lecturer (`acceptingMentorships: true`) | Zero active projects (fresh discovery & empty-state testing). |
| `lw.mentor.unavailable@lumigap.test` | Verified Lecturer (`acceptingMentorships: false`) | Availability-off banner & exclusion from discovery matching. |
| `lw.lecturer.unverified@lumigap.test` | Unverified Lecturer (`SELF_DECLARED`) | Blocked from Lecturer Workspace until verified. |
| `lw.lecturer.pending@lumigap.test` | Pending Lecturer (`PENDING`) | Pending verification state & Lecturer Workspace guard. |
| `lw.mentor.outsider@lumigap.test` | Verified Lecturer (Control) | Negative authorization checks (no access to flagship private projects). |
| `lw.student.ai@lumigap.test` | Student Owner (Public, Consented) | Flagship AI Education project & EdTech project owner. |
| `lw.student.member1@lumigap.test` | Student Member (Public, Consented) | Active co-author with clickable Academic Profile in project overview. |
| `lw.student.private@lumigap.test` | Student Member (`PRIVATE`, Unconsented) | Non-clickable limited profile in project overview & unshared member count in Team Dossier. |
| `lw.student.health@lumigap.test` | Student Owner | Medical LLM project owner (complete dossier + incoming invitation). |
| `lw.student.hci@lumigap.test` | Student Owner | Sparse dossier project (no progress section, 0 consented members) & Archived project. |
| `lw.student.nlp@lumigap.test` | Student Owner | Project seeking mentor without Prospective Access Policy configured. |
| `lw.student.env@lumigap.test` | Student Owner | Project with pending formal lecturer proposal & clarification message. |
| `lw.student.cyber@lumigap.test` | Researcher Owner | Active Cybersecurity project & Discovery-closed private project. |
| `lw.student.fin@lumigap.test` | Student Owner | Completed project with historical ended mentorship & revoked access. |

### Demo Projects & Verification Routes

1. **Flagship Complete Dossier & Active Mentorship (`lw-ai-edu`)**
   - Title: *Đánh giá hiệu quả của trợ lý AI trong học tập cá nhân hóa (Demo)*
   - Sign in as `lw.mentor.lead@lumigap.test`:
     - `/mentor-workspace?view=projects` — active mentored project list.
     - `/mentor-workspace?tab=overview&view=project&projectId=<p1Id>` — verify stable header & tabs across Overview / Tasks / Chat / Contributions, clickable consented members (`Nguyễn Minh Anh`, `Trần Hoàng Nam`) vs locked private member (`Đỗ Nhật Linh`).
     - `/mentor-workspace?view=contributions` — verify search bar non-overlap, consistent `"Mục cần bạn phản hồi"` counters (`2` = 1 `PENDING_CONFIRMATION` work contribution + 1 `PROPOSED` mentor agreement + 1 respondent integrity case), `"Đang chờ nhóm xác nhận"` for self-declared work, `"Hệ thống ghi nhận"` for Round 1 review with exact `"Xem phản biện"` link and no prominent `"Yêu cầu xem xét"` button.
2. **Incoming Invitation & Complete Dossier (`lw-med-llm`)**
   - `/mentor-workspace?view=incoming` — inspect pending `SECONDARY` invitation, synthetic intro PDF download, and prospective access policy.
3. **Sparse Dossier Without Progress / Unshared Members (`lw-hci-sparse`)**
   - `/mentor-workspace?view=discover` — open Research Team Dossier; verify clean unnumbered headings (no `1, 2, 4, 5` jump) and a single concise unshared-member notice.
4. **Missing Prospective Policy (`lw-nlp-nopolicy`)**
   - `/mentor-workspace?view=discover` — verify clear explanation when formal direct proposals require the project owner to configure prospective access first.
5. **Outgoing Proposal & Clarification (`lw-env-proposal`)**
   - `/mentor-workspace?view=outgoing` — switch between Incoming / Outgoing / History smoothly without flicker or disappearing nav counts.
6. **Accepted Request with Ended Mentorship (`lw-fin-ended`)**
   - `/mentor-workspace?view=history` — open the historical accepted invitation; verify clear separation between *Thỏa thuận ban đầu khi chấp nhận* and *Quan hệ hướng dẫn hiện tại: Đã kết thúc* (no active `"Mở dự án"` button when access is revoked).

---

## Baseline Seed Accounts (`db:seed:mentorship`)

| Email | Scenario |
| --- | --- |
| `leader@lumigap.test` | Student owner of the education project |
| `member@lumigap.test` | Member of all 3 projects |
| `student.health@lumigap.test` | Student owner of the healthcare project |
| `researcher@lumigap.test` | Researcher owner of the security project |
| `mentor.ai@lumigap.test` | Verified, available; incoming invitation |
| `mentor.health@lumigap.test` | Verified, available; outgoing offer |
| `mentor.data@lumigap.test` | Verified, available; project discovery |
| `mentor.security@lumigap.test` | Verified, available; active mentorship |
| `mentor.education@lumigap.test` | Verified, available; qualitative research |
| `mentor.sustainability@lumigap.test` | Verified, available; sustainability |
| `lecturer.pending@lumigap.test` | Unverified; excluded from mentor search |
| `lecturer.unavailable@lumigap.test` | Verified, unavailable; excluded from mentor search |
