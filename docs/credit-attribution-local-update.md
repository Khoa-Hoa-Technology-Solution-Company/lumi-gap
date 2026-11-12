# Local Docker update: CRediT and mentor journey

Updated localhost:8080 on 11 November 2026 after the user's request to update the
running application. This supersedes the earlier verification reports' statement
that the source had not yet been applied locally. No Git commit/push or remote
production deployment was performed.

## Images and running services

Built new local images from the tested production artifacts and existing Linux
runtime dependencies. Backend dependency declarations match the installed runtime;
the lockfile differs only in line endings. No host `node_modules`, credentials,
uploads or database backup was copied into an image. Native Linux dependencies were
retained; shared CRediT exports and the new Prisma client were checked inside Linux.

- `lumigap-backend:credit-attribution-20261111`, also tagged `lumigap-backend:local`.
- `lumigap-web:credit-attribution-20261111`, also tagged `lumigap-web:local`.
- Backend image ID: `08ca50704cfb9069dde4fe0763df3bf2e2f31db7f3498cb253cf7af85473d1b6`.
- Web image ID: `d610e73f83cfd2f02a96bc5f79436ed25667e33276e9c25b9b478cd48fc28a3c`.
- Both images carry `org.lumigap.local-update=20261111-credit-attribution`.

Recreated backend, web and the active notification worker. PostgreSQL, Redis, the
AI reviewer and existing manuscript compilers were preserved. Other paused workers
were not enabled. No volumes were deleted.

## Database

A compressed PostgreSQL backup was saved outside Git at:
`C:/Users/tdinh/AppData/Local/LumiGap/backups/20261111-credit-attribution/lumigap-db.dump`.
Size: 37,530,324 bytes. `pg_restore --file=/dev/null` successfully parsed the backup;
it was not restored over the live database.

Prisma applied these four additive migrations to the local application database:

1. `20261111090000_shared_research_classification`
2. `20261111091000_mentorship_support_preferences`
3. `20261111092000_keyword_classification_provenance`
4. `20261111110000_attribution_publication_policy`

One older migration remains pending:
`20261102090000_papers_openalex_id_unique`. The local database has seven duplicate
OpenAlex-ID groups and that migration deliberately refuses to create its unique
index until they are reconciled. No papers were merged/deleted and this migration
was not marked applied.

To deploy only the compatible additive changes, the disposable migration container
used a copy of the full migration directory excluding that one pending migration,
with a temporary Prisma config. Standard Prisma migration tracking/checksums were
used for all four applied changes. The canonical source migration directory remains
unchanged. A normal future full `migrate deploy` still needs the older duplicate-data
issue resolved; this update does not conceal or bypass its uniqueness check.

## Verified after activation

- Backend `/health`: HTTP 200.
- Backend `/ready`: HTTP 200.
- Web `/`: HTTP 200, serving `/assets/index-C7mkBSH5.js` from the current build.
- SHA-256 hashes of running contribution service, manuscript attribution service,
  shared CRediT taxonomy and web `index.html` match the tested workspace artifacts.
- The target project still exists and new project fields can be queried.
- All four additive migration records are finished; existing attribution checks
  remain present.
- Browser: the authenticated local session is a project mentor. Its Tasks page
  correctly shows only assigned work and adjudication items. Overview exposes
  **Ghi nhận và xác nhận đóng góp nghiên cứu của tôi**, and the contribution list
  loads successfully. No real contribution or authorship decision was submitted.

For project members, the principal CRediT screens are Project → Contributions and
the manuscript snapshot's attribution check. The Tasks page retains its task-list
purpose. For mentors, use Project → Overview → the personal contribution disclosure.

Screenshot:
`C:/Users/tdinh/.codex/visualizations/2026/11/01/01a1972b-467a-7b40-aa60-375df14ce1f1/credit-localhost-mentor.png`.

Operational logs remain in `apps/backend/scratch/credit-local-*.log`.
Previous images remain available as:
`lumigap-backend:before-20261111-credit-attribution` and
`lumigap-web:before-20261111-credit-attribution`.
The migrations are additive; image rollback does not require deleting the new data
or automatically restoring the database backup.
