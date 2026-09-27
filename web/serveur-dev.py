"""
Serveur de développement.

Sert les fichiers du site et relaie /api vers le serveur réel. Le relais
n'est pas un confort : le backend n'autorise que les origines de
production, et c'est très bien ainsi — ouvrir CORS à localhost
affaiblirait le site en ligne pour la commodité d'une machine.

    python serveur-dev.py [port]

Aucune dépendance : bibliothèque standard uniquement.
"""

import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.abspath(__file__))
SERVEUR_API = os.environ.get("YM_API", "https://yourmovies-backend.onrender.com")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173

# En-têtes à ne pas recopier : elles décrivent le transport d'origine et
# fausseraient la réponse une fois relayée.
IGNOREES = {"content-encoding", "transfer-encoding", "connection", "content-length"}


class Serveur(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RACINE, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._relayer("GET")
        return self._servir_fichier()

    def do_POST(self):
        return self._relayer("POST")

    def do_PUT(self):
        return self._relayer("PUT")

    def do_PATCH(self):
        return self._relayer("PATCH")

    def do_DELETE(self):
        return self._relayer("DELETE")

    def _servir_fichier(self):
        chemin = self.translate_path(self.path)
        # Routeur à URL réelles : toute adresse qui n'est pas un fichier
        # doit rendre la page, sinon un rafraîchissement sur /wishboard
        # renverrait une erreur 404 du serveur.
        if not os.path.isfile(chemin) and "." not in os.path.basename(self.path):
            self.path = "/index.html"
        return super().do_GET()

    def _relayer(self, methode):
        longueur = int(self.headers.get("Content-Length") or 0)
        corps = self.rfile.read(longueur) if longueur else None

        requete = urllib.request.Request(
            SERVEUR_API + self.path,
            data=corps,
            method=methode,
        )
        for nom in ("Authorization", "Content-Type", "X-Profile-Id", "X-Playback-Pass", "Accept"):
            valeur = self.headers.get(nom)
            if valeur:
                requete.add_header(nom, valeur)

        try:
            with urllib.request.urlopen(requete, timeout=60) as reponse:
                self._repondre(reponse.status, reponse.headers, reponse.read())
        except urllib.error.HTTPError as erreur:
            self._repondre(erreur.code, erreur.headers, erreur.read())
        except Exception as erreur:
            message = f'{{"detail":"Relais impossible : {erreur}"}}'.encode()
            self._repondre(502, {"Content-Type": "application/json"}, message)

    def _repondre(self, statut, entetes, corps):
        self.send_response(statut)
        for nom, valeur in (entetes.items() if hasattr(entetes, "items") else entetes.items()):
            if nom.lower() not in IGNOREES:
                self.send_header(nom, valeur)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def end_headers(self):
        # Le développement ne doit jamais servir une version périmée.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *_):
        pass


class ServeurFilaire(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with ServeurFilaire(("127.0.0.1", PORT), Serveur) as httpd:
        print(f"YourMovie's — http://127.0.0.1:{PORT}")
        print(f"API relayée vers {SERVEUR_API}")
        httpd.serve_forever()
