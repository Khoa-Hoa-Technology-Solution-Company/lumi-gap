import "../src/config/load-env.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as Y from "yjs";
import sharp from "sharp";
import type { ManuscriptEngine } from "@trend/shared-types";
import { env } from "../src/config/env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { workspaceId } from "../src/modules/projects/workspace-access.js";
import { manuscriptService as writing } from "../src/modules/workspaces/manuscript.service.js";
import { sourceDocument } from "../src/modules/workspaces/manuscript-source.js";
import { repoRoot } from "../src/config/load-env.js";

// Local, additive demo data only. Existing manuscripts and rerun demo edits are preserved.
const key = (name: string) => {
  const hash = createHash("sha256").update(`lumigap-manuscript-demo-v1:${name}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const tex = String.raw;
const examples = [
  { slug: "research-paper", title: "[Demo] AI feedback — bài nghiên cứu nhiều tệp", engine: "pdflatex" as const,
    description: "Dữ liệu giả lập để thử nhiều tệp, ảnh, công thức, bảng, BibTeX, bình luận và lịch sử. Không phải kết quả nghiên cứu thật.",
    files: {
      "main.tex": tex`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\renewcommand{\familydefault}{\sfdefault}
\usepackage{graphicx,amsmath,booktabs,hyperref}
\title{AI Feedback in Higher Education: A Demonstration Manuscript}
\author{LumiGap Demo Team}
\date{}
\begin{document}
\maketitle
\begin{abstract}
This fictional manuscript demonstrates collaborative writing, citations and PDF compilation.
All participants, references and measurements below are synthetic test data.
\end{abstract}
\tableofcontents
\input{sections/introduction.tex}
\input{sections/related_work.tex}
\input{sections/methodology.tex}
\input{sections/results.tex}
\input{sections/conclusion.tex}
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`,
      "sections/introduction.tex": tex`\section{Introduction}
Students need feedback that is timely, understandable and actionable.
This demonstration asks how a team might evaluate an AI feedback assistant.
The work of the fictional Demo Team~\cite{demo2026feedback} provides a placeholder citation.
\subsection{Research question}
How can a team compare feedback usefulness while retaining human review?
\subsection{Scope}
This source is for testing the editor; it makes no scientific claim.
\newpage
`,
      "sections/related_work.tex": tex`\section{Related Work}
The fictional benchmark~\cite{demo2026benchmark} illustrates a second bibliography entry.
Replace these entries with verified papers from your own Literature collection.
`,
      "sections/methodology.tex": tex`\section{Methodology}
\label{sec:methods}
\subsection{Demonstration design}
We illustrate a comparison between two fictional conditions, each containing 20 examples.
\begin{enumerate}
\item Collect feedback examples.
\item Ask two human reviewers to inspect each response.
\item Record disagreements and resolve them together.
\end{enumerate}
\subsection{Illustrative metric}
\begin{equation}
U = \frac{1}{n}\sum_{i=1}^{n} u_i
\end{equation}
Here $u_i$ is a synthetic usefulness score. This formula is only a typesetting example.
`,
      "sections/results.tex": tex`\section{Results}
\textbf{Synthetic data only.} Table~\ref{tab:demo} and Figure~\ref{fig:demo} test cross-references.
\begin{table}[ht]
\centering
\begin{tabular}{lrr}
\toprule
Condition & Examples & Mean score \\
\midrule
Baseline & 20 & 3.1 \\
AI-assisted & 20 & 3.8 \\
\bottomrule
\end{tabular}
\caption{Fictional values for UI and compiler testing.}\label{tab:demo}
\end{table}
\begin{figure}[ht]
\centering
\includegraphics[width=.65\linewidth]{figures/demo-scores.png}
\caption{Illustrative bars, not research evidence.}\label{fig:demo}
\end{figure}
\newpage
`,
      "sections/conclusion.tex": tex`\section{Conclusion and Limitations}
The demonstration exercises multiple files, tables, mathematics, images and bibliography.
No real experiment was conducted. Section~\ref{sec:methods} is an example of navigation across files.
\subsection{Next steps}
Replace the synthetic material, invite an existing project member to edit another section,
then compile again and inspect the saved versions.
`,
      "references.bib": tex`% These references are deliberately fictional demo records.
@misc{demo2026feedback,
  author = {{LumiGap Demo Team}},
  title = {Fictional AI Feedback Study: Editor Test Fixture},
  year = {2026},
  note = {Synthetic reference. Not a real publication.}
}
@misc{demo2026benchmark,
  author = {{LumiGap Demo Team}},
  title = {Fictional Feedback Benchmark: Compiler Test Fixture},
  year = {2026},
  note = {Synthetic reference. Not research evidence.}
}
`,
    }, image: true },
  { slug: "vietnamese", title: "[Demo] Bản thảo tiếng Việt — XeLaTeX", engine: "xelatex" as const,
    description: "Thử tiếng Việt có dấu, Unicode, công thức và chuyển trang bằng XeLaTeX.",
    files: { "main.tex": tex`\documentclass[12pt]{article}
\usepackage{fontspec}
\setmainfont{DejaVu Serif}
\usepackage{amsmath,hyperref}
\title{Ứng dụng trí tuệ nhân tạo trong hỗ trợ học tập}
\author{Nhóm nghiên cứu LumiGap — Dữ liệu mẫu}
\date{}
\begin{document}
\maketitle
\section{Giới thiệu}
Đây là bản thảo giả lập để kiểm tra tiếng Việt có dấu và cộng tác soạn thảo.
Các nội dung không phải kết quả nghiên cứu thật.
\section{Mục tiêu}
\begin{itemize}
\item Kiểm tra hiển thị: Nguyễn, nghiên cứu, phương pháp, kết quả, đóng góp.
\item Chỉnh sửa nội dung, chờ lưu trên máy chủ rồi biên dịch lại.
\item Thử bình luận, xem lịch sử và tải xuống PDF.
\end{itemize}
\section{Công thức minh họa}
\[
\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i
\]
\newpage
\section{Thảo luận}
Mở bản thảo này bằng hai tài khoản thành viên hiện có để kiểm tra đồng bộ.
Mỗi người có thể sửa một phần khác nhau và quan sát con trỏ cộng tác.
\section{Lưu ý}
Giữ lựa chọn XeLaTeX cho tệp này vì gói fontspec cần trình biên dịch hỗ trợ Unicode.
\end{document}
` }, image: false },
  { slug: "compile-error", title: "[Demo] Sửa lỗi LaTeX và giữ PDF cũ", engine: "pdflatex" as const,
    description: "Đã có một PDF thành công và một phiên bản lỗi. Mở sections/demo-error.tex, thay lệnh lỗi bằng văn bản rồi biên dịch lại.",
    files: { "main.tex": tex`\documentclass{article}
\usepackage[T1]{fontenc}
\title{Compiler Error Recovery Demo}
\author{LumiGap Demo Team}
\date{}
\begin{document}
\maketitle
\input{sections/demo-error.tex}
\end{document}
`, "sections/demo-error.tex": tex`\section{Recovery exercise}
This version compiles successfully.
The next saved version deliberately introduces an undefined command.
` }, image: false },
];

async function main() {
  const target = process.argv[process.argv.indexOf("--project") + 1];
  if (!process.argv.includes("--project") || !target) throw new Error("Pass --project <local project ID>");
  const loopback = (url: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  if (env.NODE_ENV === "production" || !env.DATABASE_URL || !loopback(env.DATABASE_URL) || !loopback(env.REDIS_URL)) throw new Error("Demo seed requires local development PostgreSQL and Redis");
  if (!env.MANUSCRIPT_COMPILER_URL) throw new Error("Configure the local manuscript compiler before seeding");
  const db = getPrisma(), project = await db.project.findUniqueOrThrow({ where: workspaceId(target), select: { id: true, ownerId: true } });
  const projectId = project.id, actorId = project.ownerId;
  const output = resolve(repoRoot, "docs/assets/manuscript-demo");
  await mkdir(output, { recursive: true });
  async function replaceText(id: string, fileId: string, text: string) {
    const current = await writing.fileContent(projectId, actorId, id, fileId);
    const doc = sourceDocument(current.state ? Buffer.from(current.state, "base64") : null);
    try {
      const vector = Y.encodeStateVector(doc), source = doc.getText("source");
      doc.transact(() => { source.delete(0, source.length); source.insert(0, text); });
      await writing.applyUpdate(projectId, actorId, id, fileId, { clientSessionId: randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") });
    } finally { doc.destroy(); }
  }
  async function compile(id: string, label: string, engine: ManuscriptEngine) {
    const snapshot = await writing.snapshot(projectId, actorId, id, { label, clientKey: randomUUID(), minimumSequences: {} });
    const job = await writing.compile(projectId, actorId, id, snapshot.id, engine);
    const deadline = Date.now() + 110000;
    while (Date.now() < deadline) {
      const state = await writing.compilations(projectId, actorId, id);
      if (state.latest?.id === job.id && !["QUEUED", "COMPILING"].includes(state.latest.status)) return state.latest;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("The local compiler worker did not finish the demo job");
  }
  for (const example of examples) {
    const clientKey = key(`${projectId}:${example.slug}`);
    const existing = await db.draftWorkspace.findFirst({ where: { projectId, createdById: actorId, clientKey }, select: { id: true } });
    if (existing) { console.log(JSON.stringify({ title: example.title, preserved: true, url: `http://localhost:8080/projects/${target}/manuscripts/${existing.id}` })); continue; }
    const draft = await writing.create(projectId, actorId, { title: example.title, description: example.description, documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey });
    let detail = await writing.detail(projectId, actorId, draft.id);
    for (const [path, text] of Object.entries(example.files)) {
      const file = detail.files.find(file => file.path === path);
      if (file) await replaceText(draft.id, file.id, text);
      else await writing.createFile(projectId, actorId, draft.id, { path, content: text, kind: "TEXT", clientKey: randomUUID() });
    }
    if (example.image) {
      const png = await sharp(Buffer.from('<svg width="600" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="240" fill="#f4f7fa"/><text x="24" y="30" font-family="sans-serif" font-size="18" fill="#273449">SYNTHETIC DEMO SCORES</text><text x="24" y="90" font-family="sans-serif" font-size="15">Baseline</text><rect x="160" y="64" width="248" height="38" fill="#94a3b8"/><text x="420" y="90" font-family="sans-serif" font-size="15">3.1</text><text x="24" y="155" font-family="sans-serif" font-size="15">AI-assisted</text><rect x="160" y="129" width="304" height="38" fill="#4f7b72"/><text x="476" y="155" font-family="sans-serif" font-size="15">3.8</text><text x="24" y="215" font-family="sans-serif" font-size="14">Illustration only. No real experiment was conducted.</text></svg>')).png().toBuffer();
      await writing.asset(projectId, actorId, draft.id, { path: "figures/demo-scores.png", data: png.toString("base64") });
    }
    await writing.comment(projectId, actorId, draft.id, { body: "[Demo] Hãy thử sửa nội dung, chờ trạng thái Đã lưu trên máy chủ, rồi bấm Biên dịch PDF. Các số liệu và tài liệu tham khảo trong bản này đều là giả lập.", clientKey: randomUUID() });
    const result = await compile(draft.id, "Demo v1 — PDF thành công", example.engine);
    if (result.status !== "SUCCESS") throw new Error(`Demo ${example.slug} failed: ${result.diagnostics.slice(-2000)}`);
    await writeFile(resolve(output, `${example.slug}.pdf`), Buffer.from(await writing.compilationPdf(projectId, actorId, draft.id, result.id)));
    await writeFile(resolve(output, `${example.slug}.zip`), Buffer.from(await writing.export(projectId, actorId, draft.id)));
    if (example.slug === "compile-error") {
      detail = await writing.detail(projectId, actorId, draft.id);
      await replaceText(draft.id, detail.files.find(file => file.path === "sections/demo-error.tex")!.id, tex`\section{Recovery exercise}
% Fix line 3: replace the undefined command with ordinary text, then compile again.
\LumiGapDemoUndefinedCommand
The previous successful PDF should remain visible until this source compiles.
`);
      const failure = await compile(draft.id, "Demo v2 — Lỗi cố ý ở dòng 3", example.engine);
      if (failure.status !== "FAILED" || !failure.diagnostics.includes("demo-error.tex:3:")) throw new Error("Expected source error was not reported");
      const state = await writing.compilations(projectId, actorId, draft.id);
      if (state.successful?.id !== result.id) throw new Error("Previous successful PDF was not preserved");
    }
    console.log(JSON.stringify({ title: example.title, engine: example.engine, status: example.slug === "compile-error" ? "EXPECTED_ERROR_WITH_PREVIOUS_PDF" : result.status, url: `http://localhost:8080/projects/${target}/manuscripts/${draft.id}` }));
  }
}
main().then(async () => { await disconnectPostgres(); process.exit(0); }).catch(async error => { console.error(error.message); await disconnectPostgres(); process.exit(1); });
