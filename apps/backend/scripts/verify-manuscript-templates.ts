/** Explicit developer smoke test. Never run at application startup or dialog open. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MANUSCRIPT_TEMPLATES, MANUSCRIPT_TEMPLATE_REGISTRY, type ManuscriptEngine, type ManuscriptTexLive } from "@trend/shared-types";
import { compileSourceFiles, compilerAvailability } from "../src/modules/workspaces/manuscript-compiler.js";
import { manuscriptTemplate } from "../src/modules/workspaces/manuscript-source.js";

const directory = resolve("../../.cache/manuscript-template-audit");
const reportDirectory = resolve("../../docs/audits/2026-11-18-manuscript-templates");
const bibliography = process.argv.includes("--bibliography");
const resultFile = bibliography ? "compile-bibliography-results.json" : process.argv.includes("--all-engines") ? "compile-results.json" : "compile-preferred-results.json";
const results: Array<{ template: string; engine: string; release: string; success: boolean; bytes: number; diagnostics?: string }> = [];
await mkdir(resolve(directory, "pdf"), { recursive: true });
await mkdir(reportDirectory, { recursive: true });
try {
  for (const template of MANUSCRIPT_TEMPLATES) {
    const definition = MANUSCRIPT_TEMPLATE_REGISTRY[template];
    const files = manuscriptTemplate("Nghiên cứu của nhóm / Research document", template).map(file => !bibliography ? file : {
      ...file,
      text: file.path === "references.bib" ? "@misc{lumigap_template_check,title={Synthetic bibliography smoke fixture},author={LumiGap Test Fixture},year={2026},note={Test data only}}\n" : file.text.replace("\\bibliography{references}", "\\nocite{lumigap_template_check}\n\\bibliography{references}"),
    });
    for (const release of compilerAvailability.versions) {
      const engines: ManuscriptEngine[] = process.argv.includes("--all-engines") ? ["pdflatex", "xelatex", "lualatex"] : [definition.preferredCompiler];
      for (const engine of engines) {
        const output = await compileSourceFiles({ engine, mainFile: definition.mainTexFile, files: files.map(file => ({ path: file.path, data: Buffer.from(file.text).toString("base64") })) }, release as ManuscriptTexLive);
        const result = { template, engine, release, success: Boolean(output.pdf), bytes: output.pdf?.length ?? 0, ...(!output.pdf ? { diagnostics: output.result.diagnostics.slice(-3000) } : {}) };
        results.push(result); console.log(JSON.stringify(result));
        if (output.pdf) await writeFile(resolve(directory, "pdf", `${template.toLowerCase()}-${release}-${engine}${bibliography ? "-bibliography" : ""}.pdf`), output.pdf);
      }
    }
    if (process.argv.includes("--previews") && compilerAvailability.versions.length) {
      const paragraph = "This is illustrative template text, not research evidence. Introduce the research question, explain the chosen method and cite verified sources. Replace this text with your own work and document limitations transparently. ";
      const previewFiles = files.map(file => ({ ...file, text: file.path.startsWith("sections/") ? file.text.replace(/%[^\n]*research[^\n]*\n/gi, paragraph.repeat(4) + "\n") : file.text }));
      const output = await compileSourceFiles({ engine: definition.preferredCompiler, mainFile: definition.mainTexFile, files: previewFiles.map(file => ({ path: file.path, data: Buffer.from(file.text).toString("base64") })) }, compilerAvailability.versions[0]!);
      if (!output.pdf) throw new Error(`Preview failed for ${template}`);
      await writeFile(resolve(directory, "pdf", `${template.toLowerCase()}-preview.pdf`), output.pdf);
    }
  }
  if (!results.length) throw new Error("No compiler configured; compilation is UNVERIFIED.");
  await writeFile(resolve(reportDirectory, resultFile), JSON.stringify(results, null, 2) + "\n");
  if (results.some(result => !result.success)) process.exitCode = 1;
} catch (error) {
  await writeFile(resolve(reportDirectory, resultFile), JSON.stringify(results, null, 2) + "\n");
  console.error(error instanceof Error ? error.message : "Template verification failed"); process.exitCode = 1;
} finally {
  // Imported queue clients are shared with the API but this is a standalone CLI.
  process.exit(process.exitCode ?? 0);
}
