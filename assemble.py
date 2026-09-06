"""Assemble la vitrine mobile à partir des exports Stitch (src/) vers docs/.

Ne touche JAMAIS au robot : la vitrine est un site séparé (autre dépôt,
autre URL GitHub Pages). Ici on :
  · garde le head Stitch (Tailwind + tokens + polices) ;
  · ajoute supabase-js, config.js et app.js (données réelles + auth) ;
  • rewrite la navigation bas de page (href réels entre les pages) ;
  · branche les boutons héros et le bouton compte du header.
"""
import os
import re

RACINE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(RACINE, "src")
DOCS = os.path.join(RACINE, "docs")

PAGES = {           # fichier src -> (page publiée, clé data-page)
    "accueil.html":    ("index.html", "accueil"),
    "selections.html": ("selections.html", "selections"),
    "corners.html":    ("corners.html", "corners"),
    "bilan.html":      ("bilan.html", "bilan"),
    "methode.html":    ("methode.html", "methode"),
    "acces.html":      ("acces.html", "acces"),
    "connexion.html":  ("connexion.html", "connexion"),
    "inscription.html": ("inscription.html", "inscription"),
    "paiement.html":   ("paiement.html", "paiement"),
}
CHEMIN_NAV = {      # data-path Stitch -> fichier publié
    "accueil": "index.html",
    "selections": "selections.html",
    "corners": "corners.html",
    "bilan": "bilan.html",
    "methode": "methode.html",
}

HEAD_INJECT = (
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
    '<link rel="manifest" href="assets/manifest.webmanifest">'
    '<meta name="theme-color" content="#0f131c">'
    '<meta name="mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
    '<link rel="apple-touch-icon" href="assets/icons-192.png">'
    '<link rel="icon" type="image/png" href="assets/icons-192.png">'
    '<style>'
    'html{background:#0a0e17;}'
    '@media (min-width:640px){'
    'body{max-width:560px;margin:0 auto;box-shadow:0 0 60px rgba(0,0,0,.6);}'
    'header.fixed,nav.fixed{max-width:560px;left:50%;transform:translateX(-50%);}'
    '}'
    '</style>')
FOOT_INJECT = (
    '<script src="assets/config.js"></script>'
    '<script src="assets/app.js"></script>'
    '<script>if("serviceWorker" in navigator)window.addEventListener("load",function(){'
    'navigator.serviceWorker.register("sw.js").catch(function(){});});</script>')


def rewrit_nav(html, cle):
    def fixe(m):
        tag = m.group(0)
        dp = re.search(r'data-path="([^"]+)"', tag)
        if not dp:
            return tag
        cible = CHEMIN_NAV.get(dp.group(1))
        if not cible:
            return tag
        tag = re.sub(r'\s*href="[^"]*"', f' href="{cible}"', tag)
        actif = dp.group(1) == cle
        tag = tag.replace(' aria-current="page"', "")
        if actif:
            tag = tag.replace("text-on-surface-variant", "text-primary-container")
            tag = tag.replace("<a ", '<a aria-current="page" ', 1)
        else:
            tag = tag.replace("text-primary-container", "text-on-surface-variant")
        return tag
    return re.sub(r"<a\b[^>]*data-path=[^>]*>", fixe, html)


def assemble(src_nom, pub, cle):
    html = open(os.path.join(SRC, src_nom), encoding="utf-8").read()
    html = html.replace("</head>", HEAD_INJECT + "</head>", 1)
    html = re.sub(r"<body\b", f'<body data-page="{cle}"', html, count=1)
    html = rewrit_nav(html, cle)
    # boutons héros : ancres href="#" dont le texte interne correspond
    for texte, cible in (("Voir les sélections du jour", "selections.html"),
                         ("Le bilan honnête", "bilan.html"),
                         ("Ouvrir le terminal complet", "selections.html")):
        html = re.sub(r'<a\b[^>]*href="#"[^>]*>(?:(?!</a>).)*?' + re.escape(texte) + r'.*?</a>',
                      lambda m: m.group(0).replace('href="#"', f'href="{cible}"', 1),
                      html, count=1, flags=re.S)
    # bouton compte du header (div ronde « person »)
    html = html.replace(
        '<div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">',
        '<div id="v-compte" role="button" style="cursor:pointer" title="Connexion" '
        'class="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">', 1)
    html = html.replace("</body>", FOOT_INJECT + "</body>", 1)
    with open(os.path.join(DOCS, pub), "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  {src_nom:16} -> docs/{pub:16} ({len(html)//1024} Ko)")


if __name__ == "__main__":
    os.makedirs(DOCS, exist_ok=True)
    for src_nom, (pub, cle) in PAGES.items():
        assemble(src_nom, pub, cle)
    open(os.path.join(DOCS, ".nojekyll"), "w").close()
    print("vitrine assemblée dans docs/ ✓")
