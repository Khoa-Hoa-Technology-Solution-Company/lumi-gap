# Manuscript writing assistant

Open a writable manuscript, select a passage (or position the cursor), and open
**Trợ lý AI**. Choose an action, add optional instructions, and send the request.
The right panel compares the original passage and proposed source. Nothing changes
until a member accepts, inserts, or replaces the selection. Explain LaTeX also
uses the latest compilation diagnostics and never offers a source replacement.

## LaTeX error repair

After a compilation failure, **Nhờ AI sửa lỗi** opens the affected source file
(or the main file when the log has no recognized source location) and selects
**Tìm và sửa lỗi LaTeX**. The request is sent only when the member clicks
**Phân tích lỗi LaTeX**. This action is also available directly in the assistant.

The assistant inspects the selected source, or the entire open file if the
selection is empty, with a 12,000-character limit per request. It receives the
latest compiler status, engine, bounded diagnostics, target file and surrounding
source. Old compilation logs are explicitly marked stale. Larger files require
selecting the relevant section. Fixes apply to one file at a time.

The member sees the original, diagnosis and corrected source before choosing
**Áp dụng bản sửa**. Repair replaces the captured source through the existing
collaborative editor, with its normal undo, persistence and permission checks.
It retains bibliography commands and existing citation keys without inserting
new bibliography records. Changed selections and navigation prevent stale fixes
from being applied. Nothing applies automatically.

**Biên dịch lại để kiểm tra** saves and compiles through the existing isolated
compiler. An AI proposal is never labeled a successful compilation. Missing
assets, missing packages or infrastructure failures may require manual steps;
AI must explain those limits rather than invent a replacement file.

## Reused infrastructure

- Existing `ai_runs` rows persist requests, status and structured results; no new
  database tables or migrations. Requests are private to their author.
- The existing `ai-jobs` BullMQ worker handles `manuscript_writing` jobs.
- LLM access goes through `withUserAi` and `cachedGenerateJSON`; private cache
  keys include the actor, manuscript, full prompt hash, model and personal provider
  namespace. Results are validated before caching. Cache lifetime is one hour.
- Existing workspace authorization is checked on request, worker execution,
  completion, polling and cancellation. Archived projects/manuscripts cannot use
  writing assistance. Generic AI-run endpoints cannot read or retry these runs.
- Existing source editing, Yjs anchors, undo and synchronization apply accepted
  suggestions. The original file and unchanged selected text must still exist.
  Cursor insertions also compare neighbouring context. A fresh manuscript request
  rechecks write access before applying. Backend collaboration checks still govern
  persistence when permissions change during an edit.

## Grounding and citations

Context includes the selected passage, nearby source, excerpts from up to 16 text
files, research objectives/questions, up to 30 active Included project papers
(metadata and abstracts), and current Accepted evidence with quotations and source
locators. Evidence from another project, excluded papers, pending/rejected evidence,
and stale analyzed evidence are not supplied. This is bounded text context, not a
claim to read every image, attachment or complete paper PDF.

The model can rank only server-supplied paper IDs. Citation metadata, DOI, BibTeX
and keys come from the existing project reference resolver. Unknown paper IDs,
citation keys, DOI and generated bibliography records fail validation. The UI
distinguishes a project source from a source with reviewed evidence; neither badge
validates a new claim. Members must check the proposed claim against its source.
Acceptance resolves cited project sources into `references.bib`, retaining manual
entries and using the backend's collision-safe key. Existing keys are read from
complete bibliography files, including files outside the bounded prompt excerpts.
Acceptance checks that suggested sources still belong to the project. Several
recommended citations can be inserted independently before accepting the passage;
each citation and passage can only be applied once per suggestion.

## API / operation

- `POST /projects/:projectId/manuscripts/:id/ai` queues an action and returns 202.
- `GET /projects/:projectId/manuscripts/:id/ai/:runId` returns author-scoped status.
- `DELETE /projects/:projectId/manuscripts/:id/ai/:runId` cancels pending work.

Requires the existing `worker:ai-jobs` service, PostgreSQL, Redis and a configured
platform or personal AI provider. Requests are limited to 10/minute and two recent
pending requests per user, with 12,000 selected characters and 2,000 instruction
characters. Queued/running requests older than ten minutes are marked failed when
polled, allowing a fresh request after worker interruption. Cancellation prevents
result publication; it does not claim to stop an in-flight provider call.

The assistant follows existing generic draft-assistance billing (no separate new
credit price). A source save and successful AI request do not imply a successful
PDF compilation. Source must be synchronized before sending an AI request.

### Repair checks and successful builds

Repair checks use the latest compilation for the exact saved source revision.
If it succeeded, the worker returns a compiler-backed report without calling the
LLM or proposing a replacement. Only warnings in the final engine pass are shown;
earlier undefined references resolved by later passes are omitted. The compiler
already runs three engine passes and BibTeX when needed. Remaining warnings do not
mean PDF compilation failed. Diagnostics for older source revisions are not sent
as current failures. Reports identify the checked revision, and the UI marks them
as historical after source changes. Unchanged AI output is advice only: no duplicate
source comparison, apply button, or warning about an uncompiled fix.

## Verification

### Operation and acceptance safeguards

- Each operation has a separate server-owned instruction and insert/replace/read-only
  output mode. Continuation receives explicit before/after context; translation keeps
  the selected target language. All prompts treat manuscript and paper text as data.
- The server pins each request to a saved file sequence, checks it again before model
  processing and before publishing, and returns source file/revision provenance.
  Apply rechecks write access, synchronization, selection anchors and nearby context.
- Insertable output must be nonempty raw source with a change summary. Lexical guards
  reject added program/setup commands, changed prose-operation numbers, math, citations,
  references, labels and paths. Reconstructing the target file catches partial command
  edits and new delimiter/environment errors. Repair permits supported syntax fixes
  without adding external files. These guards are not a complete TeX parser/compiler.
- Continuation and custom edits also preserve existing equations, citation keys, labels
  and references across selection boundaries. Citation, DOI and bibliography checks
  examine reconstructed tokens, including commands assembled partly outside the edit.
  Numeric checks read complete citation commands so digits in authorized keys do not
  become false reports of invented measurements.
- Citation searches require a literal quotation from a supplied abstract or current
  reviewed excerpt. The server checks that quotation and resolves metadata/keys itself.
  Candidate sources are ranked against the selection and instruction. Eligibility is
  checked again before publishing and when inserting an AI citation; removed/excluded
  or inactive sources cannot be newly accepted through this path. Manual citations keep
  their existing workflow. An exact quotation demonstrates traceability, not entailment.
- Regenerate retains the original source selection and operation, verifies ownership
  of the completed prior run, and uses a fresh cache key. It does not recapture a moved
  cursor or edit the manuscript. Applying or inserting remains an explicit user action.
- Static guards cannot prove that meaning, uncertainty, units or scientific reasoning
  were preserved, or that a quotation supports the claim. The preview retains human
  review warnings; only a real compiler confirms a PDF build.
- Insufficient context is a structured noninsertable clarification, not fabricated
  source or a compiler failure. The panel shows the model's specific question and
  offers a new request after the user supplies the missing information.

Unit tests cover bounded input, fabricated references/DOI/keys, canonical source
resolution and citation-only results. PostgreSQL integration tests cover private
project context, real persisted proposals, canonical bibliography insertion,
outsiders, cross-manuscript files, revoked membership, cancellation and invalid
AI output without source mutation. Frontend tests cover explicit acceptance,
rejection, conflict retention, duplicate-click prevention, independent citation
insertion and relative selection anchors under remote edits. Additional integration
cases cover bibliography keys outside the prompt budget, cancellation during the
provider call and membership revocation before result publication.
