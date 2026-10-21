# Diagrams (Reports 1–4)

Canonical sources of the diagrams used in the capstone reports, drawn from the code at commit ab1a6c5. Each diagram has a PlantUML (`.puml`) or Mermaid (`.mmd`) source and a rendered `.svg`.

| Folder | Report | Diagrams |
|---|---|---|
| `report1/` | Report 1 – Project Introduction | Major feature map (2 parts) |
| `report2/` | Report 2 – Project Management Plan | Iterative process model |
| `report3/` | Report 3 – SRS | Context, use cases, screen flows, entity relationship diagrams |
| `report4/` | Report 4 – SDD | System architecture, packages, logical ERDs, state machines, class / sequence / activity diagrams for WF-01..WF-05 |

Render PlantUML: `java -jar plantuml.jar -tsvg <file>.puml` (use cases and the admin screen flow in `report3/` were laid out with a custom script; their `.puml`/`.mmd` remain the canonical UML source).
Render Mermaid: `npx @mermaid-js/mermaid-cli -i <file>.mmd -o <file>.svg`.

Update a diagram whenever the related code (schema, status values, routes, services) changes.
