# Diagrams (Reports 1–4)

Canonical sources of the diagrams used in the capstone reports, drawn from the code at commit ca8fe4d (main). The database diagrams (ERDs) and screen flow 3(b) were updated to main 016d562 (28/10/2026: 99 migrations, 191 models). Each diagram has an editable source and a rendered `.svg`.

| Folder | Report | Diagrams |
|---|---|---|
| `report1/` | Report 1 – Project Introduction | Major feature map (3 parts) |
| `report2/` | Report 2 – Project Management Plan | Iterative process model (2 parts) |
| `report3/` | Report 3 – SRS | C4 system context, use cases, screen flows, logical ERDs |
| `report4/` | Report 4 – SDD | C4 container / component / deployment views, package diagrams, physical ERDs, state machines, class / sequence / activity diagrams for WF-01..WF-05 |

Source formats:
- `.puml` — PlantUML source. **Every diagram has one** (`java -jar plantuml.jar -tsvg <file>.puml`).
- `.drawio` — draw.io layout used for the figures in the reports (C4 views, package, state, class diagrams, screen flows, some ERDs): open in draw.io, or `draw.io -x -f svg -o <file>.svg <file>.drawio`. The `.puml` of the same name holds the same elements, relationships and labels; only the layout differs.
- `.uc.json` + `.puml` — use cases (the `.puml` is the canonical UML source; the image was laid out from the `.uc.json`)
- `.svg` — rendered figure as used in the report.

Update a diagram whenever the related code (schema, status values, routes, services) changes. ERDs follow the foreign keys of the SQL migrations in `apps/backend/prisma/migrations`.
