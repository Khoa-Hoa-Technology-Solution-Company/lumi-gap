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
