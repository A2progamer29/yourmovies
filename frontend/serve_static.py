#!/usr/bin/env python3
"""
Serveur statique minimal (lib standard Python, ZERO dependance) pour
previsualiser le site compile (dossier build/) exactement comme Netlify le servira.

Usage :  python serve_static.py [port]
Defaut :  http://localhost:5000
"""
import http.server
import os
import sys
from pathlib import Path

BUILD_DIR = Path(__file__).parent / "build"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5000


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BUILD_DIR), **kwargs)

    def do_GET(self):
        requested = (BUILD_DIR / self.path.lstrip("/").split("?")[0])
        if self.path != "/" and not requested.is_file():
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    if not BUILD_DIR.exists():
        print("Le dossier build/ n'existe pas. Lance d'abord : npm run build")
        sys.exit(1)
    os.chdir(BUILD_DIR)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), SPAHandler)
    print(f"Site statique servi sur http://localhost:{PORT}  (Ctrl+C pour arreter)")
    httpd.serve_forever()
