"""Prévisu locale de la vitrine : sert /home/user en racine (comme GitHub
Pages sert sylvermelo.github.io), donc /vitrine/... et /pronos-foot/...
coexistent — le fetch relatif ../pronos-foot/series_jour.json marche."""
import http.server
import os

ROOT = "/home/user"


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?")[0]
        if clean.startswith("/pronos-foot/") and clean.endswith(".json"):
            return "/home/user/pronos-foot/data/" + clean.rsplit("/", 1)[1]
        if clean.startswith("/vitrine/"):
            return super().translate_path("/vitrine/docs/" + clean[len("/vitrine/"):])
        if clean in ("/", "/vitrine", "/vitrine/"):
            return super().translate_path("/vitrine/docs/index.html")
        p = super().translate_path(path)
        if not os.path.exists(p) and not clean.startswith(("/vitrine", "/pronos-foot")):
            alt = super().translate_path("/vitrine/docs" + clean)
            if os.path.exists(alt):
                return alt
        return p

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", 8090), H)
    srv.serve_forever()
