"""Run inside the real compiler image; no mock TeX engine."""
import base64
import importlib.util
import json
import struct
import tempfile
import time
import unittest
from http.client import HTTPConnection
from http.server import HTTPServer
from threading import Thread
from unittest.mock import patch
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location("compiler", "/app/server.py")
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


def source(path, text):
    return {"path": path, "data": base64.b64encode(text.encode() if isinstance(text, str) else text).decode()}


class CompilerTests(unittest.TestCase):
    def test_synctex_roundtrip_across_included_file(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}"),
            source("sections/intro.tex", "\\section{Introduction}\nEvidence from the team research project.\n"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        self.assertTrue(result["synctex"])
        forward = compiler.query_synctex({"synctex": result["synctex"], "direction": "forward", "path": "sections/intro.tex", "line": 2})["locations"]
        self.assertTrue(forward, "No forward SyncTeX result")
        point = forward[0]
        inverse = compiler.query_synctex({"synctex": result["synctex"], "direction": "inverse", "page": int(point["Page"]), "x": float(point["h"]) + float(point["W"]) / 2, "y": float(point["v"]) - float(point["H"]) / 2})["locations"]
        self.assertTrue(any(location.get("Input", "").endswith("sections/intro.tex") and int(location["Line"]) > 0 for location in inverse), inverse)

    def test_lualatex_biber_and_biblatex(self):
        result = compiler.compile_source({"engine": "lualatex", "mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{article}\usepackage{fontspec}\setmainfont{DejaVu Serif}\usepackage[backend=biber]{biblatex}\addbibresource{references.bib}\begin{document}Nghiên cứu tổng hợp \parencite{demo}.\printbibliography\end{document}"),
            source("references.bib", "@article{demo,title={Synthetic Bibliography Test},author={Demo Team},journaltitle={Fixture Journal},date={2026}}"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        self.assertIn("paper.bbl", result["diagnostics"])
        final = result["diagnostics"].split("This is LuaHBTeX")[-1]
        self.assertNotIn("undefined", final)
        self.assertNotIn("Please (re)run Biber", final)

    def test_index_and_glossary(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\usepackage{makeidx}\makeindex\usepackage{glossaries}\makeglossaries\newglossaryentry{evidence}{name=evidence,description={verified source material}}\begin{document}Research\index{research} uses \gls{evidence}.\printindex\printglossaries\end{document}")]})
        self.assertTrue(result["success"], result["diagnostics"])
        self.assertIn("paper.ind", result["diagnostics"])
        self.assertIn("paper.gls", result["diagnostics"])
        final = result["diagnostics"].split("This is pdfTeX")[-1]
        self.assertNotIn("No file paper.ind", final)
        self.assertNotIn("No file paper.gls", final)

    def test_pdf_figure_with_spaces_and_parentheses(self):
        figure = compiler.compile_source({"mainFile": "figure.tex", "files": [source("figure.tex", r"\documentclass{article}\begin{document}Synthetic figure\end{document}")]})
        self.assertTrue(figure["success"], figure["diagnostics"])
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{article}\usepackage{graphicx}\begin{document}\includegraphics[width=5cm]{figures/Research diagram (1).pdf}\end{document}"),
            source("figures/Research diagram (1).pdf", base64.b64decode(figure["pdf"])),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])

    def test_lua_cannot_escape_sandbox(self):
        result = compiler.compile_source({"engine": "lualatex", "mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}\directlua{local f=io.open('/etc/passwd','r'); if f then tex.error('Private file readable') end; os.execute('touch escaped.txt')}\InputIfFileExists{escaped.txt}{\errmessage{Shell escape allowed}}{}Safe\end{document}")]})
        self.assertTrue(result["success"], result["diagnostics"])

    def test_t1_fonts_are_scalable_for_existing_and_new_sources(self):
        for font in ["", r"\usepackage{lmodern}\renewcommand{\familydefault}{\sfdefault}"]:
            with self.subTest(font=font):
                result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\pdfobjcompresslevel=0\documentclass{article}\usepackage[T1]{fontenc}" + font + r"\begin{document}\section{Research}Scalable research typography.\end{document}")]})
                self.assertTrue(result["success"], result["diagnostics"])
                pdf = base64.b64decode(result["pdf"])
                self.assertNotIn(b"/Subtype /Type3", pdf)
                self.assertIn(b"/Subtype /Type1", pdf)

    def test_ieee_conference_template_and_algorithm_packages(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass[conference,onecolumn]{IEEEtran}\IEEEoverridecommandlockouts\usepackage{cite,amsmath,amssymb,amsfonts,algorithmic,graphicx,textcomp,xcolor,flushend,hyperref,placeins,float}\begin{document}\title{IEEE Research Template}\author{Demo Team}\maketitle\section{Introduction}A fictional citation~\cite{demo}.\begin{algorithmic}\STATE Inspect source evidence\end{algorithmic}\bibliographystyle{IEEEtran}\bibliography{references}\end{document}"),
            source("references.bib", "@misc{demo,title={Synthetic Template Test},author={Demo Team},year={2026}}"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])

    def test_multifile_bibliography_and_image(self):
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b"")
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{article}\usepackage{graphicx}\begin{document}\input{sections/intro.tex}\includegraphics[width=1cm]{figures/test.png}\bibliographystyle{plain}\bibliography{references}\end{document}"),
            source("sections/intro.tex", r"Research evidence \cite{ref}."),
            source("references.bib", "@article{ref,title={Evidence},author={Team},journal={Research},year={2026}}"),
            source("figures/test.png", png),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        self.assertTrue(base64.b64decode(result["pdf"]).startswith(b"%PDF-"))
        self.assertNotIn("Citation `ref' on page 1 undefined", result["diagnostics"].split("This is pdfTeX")[-1])

    def test_xelatex_vietnamese(self):
        result = compiler.compile_source({"engine": "xelatex", "mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\usepackage{fontspec}\setmainfont{DejaVu Serif}\begin{document}Nghiên cứu khoa học cùng nhóm LumiGap.\end{document}")]})
        self.assertTrue(result["success"], result["diagnostics"])

    def test_bilingual_template_with_both_engines(self):
        text = r"""\documentclass[11pt]{article}
\usepackage{iftex}
\ifPDFTeX
  \usepackage[utf8]{inputenc}
  \usepackage[T1,T5]{fontenc}
  \usepackage{lmodern}
\else
  \usepackage{fontspec}
  \setmainfont{DejaVu Serif}
\fi
\title{Nghiên cứu phản hồi bền vững}
\begin{document}\maketitle
Nghiên cứu khoa học cùng nhóm. Academic writing and evidence.
\end{document}"""
        for engine in ("pdflatex", "xelatex"):
            with self.subTest(engine=engine):
                result = compiler.compile_source({"engine": engine, "mainFile": "main.tex", "files": [source("main.tex", text)]})
                self.assertTrue(result["success"], result["diagnostics"])
                self.assertNotIn("Missing character:", result["diagnostics"])

    def test_include_subdirectories_bibliography_and_cross_references(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{report}\usepackage{natbib}\begin{document}\tableofcontents\include{chapters/intro}\include{chapters/results}\bibliographystyle{plainnat}\bibliography{references}\end{document}"),
            source("chapters/intro.tex", r"\chapter{Introduction}\label{chapter:intro}Evidence \citep{demo}. See chapter~\ref{chapter:results}."),
            source("chapters/results.tex", r"\chapter{Results}\label{chapter:results}See chapter~\ref{chapter:intro}."),
            source("references.bib", "@article{demo,title={Synthetic Included Chapter},author={Demo Team},journal={Fixture Journal},year={2026}}"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        final_pass = result["diagnostics"].split("This is pdfTeX")[-1]
        self.assertNotIn("undefined", final_pass)
        self.assertNotIn("No file paper.bbl", final_pass)

    def test_root_include_and_nocite_bibliography(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{article}\begin{document}\include{intro}\bibliographystyle{plain}\bibliography{references}\end{document}"),
            source("intro.tex", r"\section{Introduction}List all supplied references.\nocite{*}"),
            source("references.bib", "@misc{demo,title={Synthetic Included Source},author={Demo Team},year={2026}}"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        final_pass = result["diagnostics"].split("This is pdfTeX")[-1]
        self.assertNotIn("No file paper.bbl", final_pass)
        self.assertNotIn("undefined", final_pass)

    def test_project_class_package_and_bibliography_style(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [
            source("main.tex", r"\documentclass{teamarticle}\usepackage{teamstyle,amsmath,booktabs}\begin{document}\section{Methods}\TeamName\begin{equation}\label{eq:test}E=mc^2\end{equation}See equation~\ref{eq:test}.\begin{tabular}{ll}\toprule Method & Result\\\midrule Demo & Fictional\\\bottomrule\end{tabular}\cite{demo}\bibliographystyle{teamstyle}\bibliography{references}\end{document}"),
            source("teamarticle.cls", r"\NeedsTeXFormat{LaTeX2e}\ProvidesClass{teamarticle}[2026/10/20 Test class]\LoadClass[11pt]{article}"),
            source("teamstyle.sty", r"\ProvidesPackage{teamstyle}\newcommand{\TeamName}{Synthetic Demo Team}"),
            source("teamstyle.bst", r'''ENTRY { author title year } {} {}
FUNCTION {begin.bib} { "\begin{thebibliography}{9}" write$ newline$ }
FUNCTION {article} { "\bibitem{" write$ cite$ write$ "}" write$ newline$ title write$ newline$ }
FUNCTION {end.bib} { "\end{thebibliography}" write$ newline$ }
READ
EXECUTE {begin.bib}
ITERATE {call.type$}
EXECUTE {end.bib}'''),
            source("references.bib", "@article{demo,title={Synthetic Custom Style},author={Demo Team},year={2026}}"),
        ]})
        self.assertTrue(result["success"], result["diagnostics"])
        self.assertNotIn("undefined", result["diagnostics"].split("This is pdfTeX")[-1])

    def test_new_manuscript_with_empty_bibliography(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}New team manuscript\bibliographystyle{plain}\bibliography{references}\end{document}"), source("references.bib", "% No references yet")]})
        self.assertTrue(result["success"], result["diagnostics"])

    def test_actual_latex_error_has_file_and_line(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", "\\documentclass{article}\n\\begin{document}\n\\unknownLumiGapCommand\n\\end{document}")]})
        self.assertFalse(result["success"])
        self.assertIsNone(result["pdf"])
        self.assertIn("main.tex:3:", result["diagnostics"])

    def test_paths_and_engine_rejected(self):
        for path in ["../escape.tex", "/etc/escape.tex", "a/../../escape.tex", "a\\escape.tex", "a/./escape.tex", "lumigap-build/paper.tex"]:
            with self.assertRaises(ValueError):
                compiler.compile_source({"mainFile": path, "files": [source(path, "text")]})
        with self.assertRaises(ValueError):
            compiler.compile_source({"engine": "sh"})

    def test_filesystem_network_environment_and_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = """import os,socket
assert 'INTERNAL_SERVICE_KEY' not in os.environ
for path in ['/etc/passwd','/proc/self/environ','/app/server.py']:
 try: open(path).read()
 except PermissionError: pass
 else: raise AssertionError(path)
try: socket.socket()
except PermissionError: pass
else: raise AssertionError('network allowed')
open('allowed.txt','w').write('ok')
try: open('/tmp/escape.txt','w').write('escape')
except PermissionError: pass
else: raise AssertionError('write escape')
"""
            self.assertEqual(compiler.command(root, ["/usr/bin/python3", "-c", script], time.monotonic() + 10, root / "test.log"), 0, (root / "test.log").read_text())
            with self.assertRaises(compiler.CompilationTimedOut):
                compiler.command(root, ["/usr/bin/python3", "-c", "while True: pass"], time.monotonic() + 0.2, root / "timeout.log")

    def test_http_reports_structured_timeout_after_killing_sandbox(self):
        run_command = compiler.command

        def short_budget(root, args, deadline, log):
            return run_command(root, args, min(deadline, time.monotonic() + 0.2), log)

        server = HTTPServer(("127.0.0.1", 0), compiler.Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection(*server.server_address, timeout=10)
        try:
            with patch.object(compiler, "command", side_effect=short_budget):
                connection.request("POST", "/compile", json.dumps({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}\def\forever{\forever}\forever\end{document}")]}), {"X-Internal-Key": compiler.KEY, "Content-Type": "application/json"})
                response = connection.getresponse()
                result = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertEqual(result["errorCode"], "TIMED_OUT")
            self.assertFalse(result["success"])
            self.assertIsNone(result["pdf"])
            # A timed-out job must not poison the compiler for subsequent jobs.
            result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}Recovered\end{document}")]})
            self.assertTrue(result["success"], result["diagnostics"])
        finally:
            connection.close()
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()

    def test_tex_shell_escape_and_private_read_blocked(self):
        result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}\immediate\write18{touch escaped.txt}\InputIfFileExists{escaped.txt}{\errmessage{Shell escape was allowed}}{}Safe\end{document}")]})
        self.assertTrue(result["success"], result["diagnostics"])
        result = compiler.compile_source({"mainFile": "main.tex", "files": [source("main.tex", r"\documentclass{article}\begin{document}\input{/etc/passwd}\end{document}")]})
        self.assertFalse(result["success"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
