"""Serveur statique du mode solo CHIMÈRE (http://localhost:8000).

Même rôle que `python -m http.server`, mais sans cache navigateur : chaque
rechargement récupère vraiment les fichiers du dossier. Ça évite de jouer une
version périmée après une modification de js/*.js ou css/style.css.

Usage : python tools/solo-server.py [port]
"""
import functools
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            import json
            self.wfile.write(json.dumps({
                'name': 'CHIMÈRE (solo)',
                'online': 0
            }).encode())
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with Server(('0.0.0.0', PORT), handler) as httpd:
        print(f'CHIMERE solo -> http://localhost:{PORT}  (dossier {ROOT})')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass