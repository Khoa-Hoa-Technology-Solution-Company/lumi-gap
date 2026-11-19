import importlib.util
import json
from pathlib import Path
import threading
import unittest
from http.client import HTTPConnection
from http.server import HTTPServer
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("local_relay", Path(__file__).with_name("local-relay.py"))
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class LocalRelayTests(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), relay.Handler)
        relay.TARGETS[self.server.server_port] = "manuscript-compiler"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.upstream = MagicMock()
        self.upstream.getresponse.return_value.status = 200
        self.upstream.getresponse.return_value.read.return_value = b'{"available":true}'
        self.mock = patch.object(relay.http.client, "HTTPConnection", return_value=self.upstream)
        self.factory = self.mock.start()

    def tearDown(self):
        self.mock.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        del relay.TARGETS[self.server.server_port]

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_health_forwards_only_to_fixed_destination(self):
        self.assertEqual(self.request("GET", "/health"), (200, b'{"available":true}'))
        self.factory.assert_called_once_with("manuscript-compiler", 8020, timeout=75)

    def test_source_and_auth_reach_compiler_without_forwarding_host(self):
        body = json.dumps({"mainFile": "main.tex"})
        self.assertEqual(self.request("POST", "/compile", body, {"X-Internal-Key": "test-key", "Host": "untrusted"})[0], 200)
        self.upstream.request.assert_called_once_with("POST", "/compile", body=body.encode(), headers={"Content-Type": "application/json", "X-Internal-Key": "test-key"})

    def test_disallows_arbitrary_paths_missing_auth_and_oversized_body(self):
        for method, path in [("GET", "/compile"), ("POST", "http://example.org/compile"), ("POST", "/compile?target=other")]:
            self.assertEqual(self.request(method, path)[0], 404)
        self.assertEqual(self.request("POST", "/compile", b"{}")[0], 403)
        self.assertEqual(self.request("POST", "/compile", headers={"Content-Length": str(relay.MAX_SOURCE + 1)})[0], 413)
        self.assertEqual(self.request("POST", "/compile", headers={"Transfer-Encoding": "chunked"})[0], 413)
        self.factory.assert_not_called()

    def test_preserves_compiler_rejection_and_handles_connection_failure(self):
        self.upstream.getresponse.return_value.status = 403
        self.assertEqual(self.request("POST", "/synctex", b"{}", {"X-Internal-Key": "invalid-key"})[0], 403)
        self.upstream.request.side_effect = OSError("unavailable")
        status, body = self.request("GET", "/health")
        self.assertEqual(status, 502)
        self.assertNotIn(b"unavailable", body)


if __name__ == "__main__":
    unittest.main()
