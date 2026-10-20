"""Private, bounded TeX compiler. No DB, Redis, host mounts, or Docker socket."""
import base64
import hmac
import gzip
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
SAFE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. ()-]*(/[A-Za-z0-9][A-Za-z0-9_. ()-]*)*$")
_version = subprocess.run(["/usr/bin/pdflatex", "--version"], capture_output=True, text=True, check=True, timeout=5).stdout.splitlines()[0]
_release = re.search(r"TeX Live (20[0-9]{2})", _version)
if not _release:
    raise RuntimeError("Cannot identify installed TeX Live release")
TOOLCHAIN = f"TeX Live {_release.group(1)} / Debian; Landlock + seccomp"


class CompilationTimedOut(ValueError):
    pass


def command(root, args, deadline, log):
    environment = {"PATH": "/usr/bin:/bin", "HOME": str(root), "TMPDIR": str(root),
                   # New luaotfload opens installed Unicode tables by absolute path.
                   # Landlock still restricts all reads to installed resources/job.
                   "openin_any": "r" if args[0] == "/usr/bin/lualatex" else "p", "openout_any": "p", "shell_escape": "f",
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
    if engine not in ("pdflatex", "xelatex", "lualatex"):
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
            if path.lower() in seen or path.lower().split("/")[0] == "lumigap-build" or Path(path).suffix.lower() not in (".tex", ".bib", ".sty", ".cls", ".bst", ".txt", ".csv", ".tsv", ".dat", ".tikz", ".pgf", ".ist", ".bbx", ".cbx", ".lbx", ".def", ".cfg", ".fd", ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".svg", ".eps"):
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
        # Vector sources are never parsed by the API or browser. Fixed converters
        # run under the same filesystem/network/resource sandbox as TeX.
        vectors = [item["path"] for item in files if item["path"].endswith((".svg", ".eps"))]
        if len(vectors) > 40:
            raise ValueError("At most 40 vector figures per compilation")
        for vector in vectors:
            output = "./" + vector + ".pdf"
            if (root / (vector + ".pdf")).exists():
                raise ValueError("Generated vector PDF conflicts with a source file")
            args = ["/usr/bin/rsvg-convert", "--format=pdf", "--output", output, "./" + vector] if vector.endswith(".svg") else ["/usr/bin/gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=pdfwrite", "-sOutputFile=" + output, "./" + vector]
            if command(root, args, deadline, log) != 0:
                raise ValueError("Vector figure conversion failed: " + vector)
            if not (root / (vector + ".pdf")).is_file() or (root / (vector + ".pdf")).stat().st_size > 5_000_000:
                raise ValueError("Converted vector figure exceeds its limit")
        if vectors:
            wrapper = build / "vector-main.tex"
            wrapper.write_text("\\AddToHook{begindocument/end}{\\DeclareGraphicsRule{.svg}{pdf}{.svg.pdf}{}\\DeclareGraphicsRule{.eps}{pdf}{.eps.pdf}{}}\n\\input{" + main + "}\n")
            main = "lumigap-build/vector-main.tex"
        arguments = [f"/usr/bin/{engine}", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error",
                     "-file-line-error", "-synctex=1", "-output-directory=lumigap-build", "-jobname=paper", "./" + main]
        succeeded = command(root, arguments, deadline, log) == 0
        # \include writes citations to child .aux files rather than paper.aux.
        # Depending on the include path, TeX places them in the build directory
        # or beside the supplied chapters. All are private to this job.
        auxiliary = [path.read_text(errors="replace") for path in root.rglob("*.aux")]
        if succeeded and (build / "paper.bcf").is_file():
            succeeded = command(root, ["/usr/bin/biber", "--noconf", "--input-directory=lumigap-build", "--output-directory=lumigap-build", "paper"], deadline, log) == 0
        elif succeeded and any("\\bibdata{" in text for text in auxiliary) and any("\\citation{" in text for text in auxiliary):
            succeeded = command(root, ["/usr/bin/bibtex", "lumigap-build/paper"], deadline, log) == 0
        # Fixed arguments only. Never run project-provided latexmkrc or shell commands.
        if succeeded and (build / "paper.idx").is_file() and (build / "paper.idx").stat().st_size:
            succeeded = command(root, ["/usr/bin/makeindex", "lumigap-build/paper.idx"], deadline, log) == 0
        if succeeded:
            for extension, style, output in [("glo", "ist", "gls"), ("acn", "ist", "acr")]:
                if (build / f"paper.{extension}").is_file() and (build / f"paper.{extension}").stat().st_size:
                    succeeded = command(root, ["/usr/bin/makeindex", "-s", "lumigap-build/paper." + style, "-o", "lumigap-build/paper." + output, "lumigap-build/paper." + extension], deadline, log) == 0
                    if not succeeded:
                        break
        if succeeded:
            succeeded = command(root, arguments, deadline, log) == 0
        if succeeded:
            succeeded = command(root, arguments, deadline, log) == 0
        # Intermediate passes legitimately contain unresolved citations/references.
        # After success expose the FINAL TeX log, so the UI/AI cannot mistake
        # warnings already resolved by BibTeX and later passes for current issues.
        final_log = build / "paper.log"
        diagnostic_log = final_log if succeeded and final_log.is_file() else log
        diagnostics = diagnostic_log.read_bytes()[-64000:].decode("utf-8", errors="replace").replace(str(root) + "/", "")
        pdf = build / "paper.pdf"
        data = pdf.read_bytes() if succeeded and pdf.is_file() and pdf.stat().st_size <= 20_000_000 else None
        if data and not data.startswith(b"%PDF-"):
            data = None
        sync = None
        sidecar = build / "paper.synctex.gz"
        if data and sidecar.is_file() and sidecar.stat().st_size <= 2_000_000:
            try:
                with gzip.open(sidecar, "rb") as stream:
                    raw = stream.read(8_000_001)
                if len(raw) <= 8_000_000:
                    # The temporary compile path disappears after this request.
                    # Store relocatable source paths, never a machine-specific root.
                    normalized = gzip.compress(raw.replace((str(root) + "/").encode(), b""))
                    if len(normalized) <= 2_000_000:
                        sync = base64.b64encode(normalized).decode("ascii")
            except (OSError, EOFError):
                pass  # A valid PDF is still useful if SyncTeX is unavailable.
        return {"success": bool(data), "diagnostics": diagnostics, "toolchain": TOOLCHAIN, "synctex": sync,
                "pdf": base64.b64encode(data).decode("ascii") if data else None}


def query_synctex(payload):
    encoded = payload.get("synctex", "")
    if not isinstance(encoded, str) or len(encoded) > 2_700_000:
        raise ValueError("Invalid SyncTeX data")
    data = base64.b64decode(encoded, validate=True)
    if len(data) > 2_000_000:
        raise ValueError("SyncTeX data exceeds limit")
    with tempfile.TemporaryDirectory(prefix="lumigap-sync-") as directory:
        root = Path(directory)
        (root / "paper.synctex.gz").write_bytes(data)
        (root / "paper.pdf").write_bytes(b"%PDF-1.7\n%%EOF")
        if payload.get("direction") == "forward":
            path, line = payload.get("path", ""), payload.get("line", 0)
            if not isinstance(path, str) or len(path) > 240 or not SAFE_PATH.fullmatch(path) or any(part in (".", "..") for part in path.split("/")) or not isinstance(line, int) or not 1 <= line <= 500000:
                raise ValueError("Invalid source location")
            args = ["view", "-i", f"{line}:0:{path}", "-o", "paper.pdf"]
        elif payload.get("direction") == "inverse":
            page, x, y = payload.get("page", 0), payload.get("x", -1), payload.get("y", -1)
            if not isinstance(page, int) or not 1 <= page <= 10000 or not all(isinstance(v, (int, float)) and 0 <= v <= 20000 for v in (x, y)):
                raise ValueError("Invalid PDF location")
            args = ["edit", "-o", f"{page}:{x}:{y}:paper.pdf"]
        else:
            raise ValueError("Invalid SyncTeX direction")
        log = root / "sync.txt"
        if command(root, ["/usr/bin/synctex", *args], time.monotonic() + 5, log) != 0:
            return {"locations": []}
        records, current = [], None
        for line in log.read_bytes()[:64000].decode("utf-8", errors="replace").splitlines():
            if line.startswith("Output:"):
                if current is not None:
                    records.append(current)
                current = {}
            elif line == "SyncTeX result end":
                if current is not None:
                    records.append(current)
                current = None
            elif current is not None and ":" in line:
                key, value = line.split(":", 1)
                if key in ("Page", "Line", "Column", "h", "v", "W", "H", "Input"):
                    current[key] = value
        return {"locations": records[:40]}


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
        if self.path not in ("/compile", "/synctex") or not hmac.compare_digest(self.headers.get("X-Internal-Key", ""), KEY):
            return self.reply(403, {"error": "Forbidden"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 28_000_000:
                return self.reply(413, {"error": "Source size exceeded"})
            self.connection.settimeout(15)
            payload = json.loads(self.rfile.read(size))
            result = query_synctex(payload) if self.path == "/synctex" else compile_source(payload)
            self.reply(200, result)
        except CompilationTimedOut as error:
            self.reply(200, {"success": False, "errorCode": "TIMED_OUT", "diagnostics": str(error), "toolchain": TOOLCHAIN, "pdf": None})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.reply(200, {"success": False, "diagnostics": str(error)[:2000], "toolchain": TOOLCHAIN, "pdf": None})


if __name__ == "__main__":
    # Single active compile; BullMQ supplies the queue. No cross-job shared source directory.
    HTTPServer(("0.0.0.0", 8020), Handler).serve_forever()
