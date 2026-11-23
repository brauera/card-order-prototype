#!/usr/bin/env python3
"""Static server for the prototype with a deep accept queue.

`python3 -m http.server` keeps the default backlog of 5, so a page that requests
~250 images at once gets connection resets. Usage: python3 tools/serve.py [port]
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 512
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep the console quiet
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    handler = functools.partial(Handler, directory=str(ROOT))
    print(f"serving {ROOT} on http://127.0.0.1:{port}")
    Server(("127.0.0.1", port), handler).serve_forever()
