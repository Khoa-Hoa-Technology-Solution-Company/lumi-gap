"""Local Windows bridge. Only fixed compiler hosts and API paths are reachable.

The TeX services stay on the internal network; this process never executes TeX.
"""
import http.client
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

TARGETS = {8020: "manuscript-compiler", 8025: "manuscript-compiler-2025"}
MAX_SOURCE = 28_000_000
MAX_RESPONSE = 31_000_000


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log private sources, tokens, or PDFs.

    def forward(self):
        allowed = self.path == "/health" if self.command == "GET" else self.path in ("/compile", "/synctex")
        if not allowed:
            return self.send_error(404)
        try:
            self.connection.settimeout(15)
            size = int(self.headers.get("Content-Length", "0"))
            if self.headers.get("Transfer-Encoding") or not 0 <= size <= MAX_SOURCE:
                return self.send_error(413)
            if self.command == "POST" and not self.headers.get("X-Internal-Key"):
                return self.send_error(403)
            body = self.rfile.read(size) if size else None
            if body is not None and len(body) != size:
                return self.send_error(400)
        except (ValueError, OSError):
            return self.send_error(400)
        # Never derive the host, port, path, or forwarded headers from a URL.
        connection = http.client.HTTPConnection(TARGETS[self.server.server_port], 8020, timeout=75)
        try:
            connection.request(self.command, self.path, body=body, headers={
                "Content-Type": "application/json",
                "X-Internal-Key": self.headers.get("X-Internal-Key", ""),
            })
            response = connection.getresponse()
            result = response.read(MAX_RESPONSE + 1)
            if len(result) > MAX_RESPONSE:
                return self.send_error(502)
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(result)))
            self.end_headers()
            self.wfile.write(result)
        except (OSError, http.client.HTTPException):
            self.send_error(502)
        finally:
            connection.close()

    do_GET = forward
    do_POST = forward


if __name__ == "__main__":
    for port in TARGETS:
        server = HTTPServer(("0.0.0.0", port), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Event().wait()
