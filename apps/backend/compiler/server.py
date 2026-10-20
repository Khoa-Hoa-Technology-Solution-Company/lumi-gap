"""Private, bounded TeX compiler. No DB, Redis, host mounts, or Docker socket."""
import base64
import hmac
import json
import os
import re
import signal
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")
if len(KEY) < 32:
    raise RuntimeError("INTERNAL_SERVICE_KEY must contain at least 32 characters")
SAFE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. -]*(/[A-Za-z0-9][A-Za-z0-9_. -]*)*$")
TOOLCHAIN = "TeX Live 2022 / Debian bookworm; Landlock + seccomp"


class CompilationTimedOut(ValueError):
    pass


def command(root, args, deadline, log):
    environment = {"PATH": "/usr/bin:/bin", "HOME": str(root), "TMPDIR": str(root),
                   "openin_any": "p", "openout_any": "p", "shell_escape": "f",
                   "TEXMFOUTPUT": str(root), "TEXMFVAR": str(root / "cache"),
                   "TEXINPUTS": ".:", "BIBINPUTS": ".:", "BSTINPUTS": ".:", "LC_ALL": "C.UTF-8"}
    with open(log, "ab") as output:
        process = subprocess.Popen(["/usr/local/bin/tex-sandbox", str(root), *args], cwd=root,
                                   env=environment, stdin=subprocess.DEVNULL, stdout=output,
                                   stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)
        try:
            return process.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise CompilationTimedOut("Compilation exceeded the 60 second time limit.")


def compile_source(payload):
    engine = payload.get("engine", "pdflatex")
    if engine not in ("pdflatex", "xelatex"):
        raise ValueError("Unsupported engine")
    files = payload.get("files", [])
    if not 1 <= len(files) <= 200:
        raise ValueError("Choose 1–200 source files")
    with tempfile.TemporaryDirectory(prefix="lumigap-tex-") as directory:
        root = Path(directory)
        seen, total = set(), 0
        for item in files:
            path = item["path"]
            if not isinstance(path, str) or len(path) > 240 or not SAFE_PATH.fullmatch(path) or any(p in (".", "..") for p in path.split("/")):
                raise ValueError("Invalid source path")
            if path.lower() in seen or path.startswith("lumigap-build/") or Path(path).suffix.lower() not in (".tex", ".bib", ".sty", ".txt", ".png", ".jpg", ".jpeg", ".webp"):
                raise ValueError("Unsupported or duplicate source path")
            seen.add(path.lower())
            content = base64.b64decode(item["data"], validate=True)
            total += len(content)
            if total > 20_000_000:
                raise ValueError("Source exceeds 20 MB")
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        main = payload.get("mainFile", "")
        if main.lower() not in seen or not main.endswith(".tex"):
            raise ValueError("Choose a .tex main file")
        build = root / "lumigap-build"
        build.mkdir()
        log = build / "compiler.txt"
        deadline = time.monotonic() + 60
        arguments = [f"/usr/bin/{engine}", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error",
                     "-file-line-error", "-output-directory=lumigap-build", "-jobname=paper", "./" + main]
        succeeded = command(root, arguments, deadline, log) == 0
        aux = build / "paper.aux"
        if succeeded and aux.exists() and "\\bibdata{" in aux.read_text(errors="replace") and "\\citation{" in aux.read_text(errors="replace"):
            succeeded = command(root, ["/usr/bin/bibtex", "lumigap-build/paper"], deadline, log) == 0
        if succeeded:
            succeeded = command(root, arguments, deadline, log) == 0
        if succeeded:
            succeeded = command(root, arguments, deadline, log) == 0
        diagnostics = log.read_bytes()[-64000:].decode("utf-8", errors="replace").replace(str(root) + "/", "")
        pdf = build / "paper.pdf"
        data = pdf.read_bytes() if succeeded and pdf.is_file() and pdf.stat().st_size <= 20_000_000 else None
        if data and not data.startswith(b"%PDF-"):
            data = None
        return {"success": bool(data), "diagnostics": diagnostics, "toolchain": TOOLCHAIN,
                "pdf": base64.b64encode(data).decode("ascii") if data else None}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log source, request headers, or PDF payloads.

    def reply(self, code, body):
        encoded = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "Not found"})
        with tempfile.TemporaryDirectory() as directory:
            check = subprocess.run(["/usr/local/bin/tex-sandbox", directory, "/usr/bin/true"],
                                   capture_output=True, timeout=3, env={})
        return self.reply(200 if check.returncode == 0 else 503, {"available": check.returncode == 0, "toolchain": TOOLCHAIN})

    def do_POST(self):
        if self.path != "/compile" or not hmac.compare_digest(self.headers.get("X-Internal-Key", ""), KEY):
            return self.reply(403, {"error": "Forbidden"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 28_000_000:
                return self.reply(413, {"error": "Source size exceeded"})
            self.connection.settimeout(15)
            result = compile_source(json.loads(self.rfile.read(size)))
            self.reply(200, result)
        except CompilationTimedOut as error:
            self.reply(200, {"success": False, "errorCode": "TIMED_OUT", "diagnostics": str(error), "toolchain": TOOLCHAIN, "pdf": None})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.reply(200, {"success": False, "diagnostics": str(error)[:2000], "toolchain": TOOLCHAIN, "pdf": None})


if __name__ == "__main__":
    # Single active compile; BullMQ supplies the queue. No cross-job shared source directory.
    HTTPServer(("0.0.0.0", 8020), Handler).serve_forever()
