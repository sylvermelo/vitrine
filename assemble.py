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
    "methode": "acces.html",      # Méthode retirée : le 5e slot mène à Accès
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
        if dp.group(1) == "methode":
            tag = re.sub(r'(<span class="material-symbols-outlined text-\[22px\]">)[^<]*(</span>)',
                         r'\1key\2', tag)
            tag = re.sub(r'(<span class="font-label-micro[^"]*"[^>]*>)Méthode(</span>)',
                         r'\1Accès\2', tag)
        actif = dp.group(1) == cle
        tag = tag.replace(' aria-current="page"', "")
        if actif:
            tag = tag.replace("text-on-surface-variant", "text-primary-container")
            tag = tag.replace("<a ", '<a aria-current="page" ', 1)
        else:
            tag = tag.replace("text-primary-container", "text-on-surface-variant")
        return tag
    return re.sub(r"<a\b[^>]*data-path=[^>]*>(?:(?!</a>).)*?</a>",
                    fixe, html, flags=re.S)


def assemble(src_nom, pub, cle):
    html = open(os.path.join(SRC, src_nom), encoding="utf-8").read()
    html = html.replace("</head>", HEAD_INJECT + "</head>", 1)
    html = re.sub(r"<body\b", f'<body data-page="{cle}"', html, count=1)
    html = rewrit_nav(html, cle)
    # titre de page dans le header (« TERMINAL VIEW » + nom)
    TITRES = {"accueil": "Accueil", "selections": "Sélections",
              "corners": "Corners", "bilan": "Bilan", "acces": "Accès",
              "connexion": "Connexion", "inscription": "Inscription",
              "paiement": "Abonnement"}
    html = re.sub(r'(TERMINAL VIEW</span><span class="font-headline-sm[^>]*>)[^<]*',
                  lambda m: m.group(1) + TITRES.get(cle, "PRONOS FOOT"), html, count=1)
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

    # ---- PURGE DES MOCKS STITCH : aucune fausse donnée dans le HTML livré --
    def coupe(debut, fin, rempl, depuis_fin=False):
        nonlocal html
        i = html.find(debut)
        if i == -1:
            return
        j = html.find(fin, i)
        if j == -1:
            return
        if depuis_fin:
            j = html.rfind("<div", i, j)
        # rééquilibrage : la zone coupée doit contenir autant de <div> que de
        # </div>, sinon on avale/oublie la fermeture du conteneur parent.
        for _ in range(8):
            seg = html[i:j]
            o = len(re.findall(r"<div\b", seg))
            c = len(re.findall(r"</div>", seg))
            if c > o:
                # fermetures en trop : elles ferment un conteneur ouvert AVANT
                # la zone -> on les laisse en place en reculant la fin de coupe
                k = html.rfind("</div>", i, j)
                if k == -1:
                    break
                j = k
            elif o > c:
                k = html.find("</div>", j)
                if k == -1:
                    break
                j = k + 6
            else:
                break
        html = html[:i] + rempl + html[j:]

    if cle == "accueil":
        i = html.find("<!-- Quantitative Rows -->")
        j = html.find("Ouvrir le terminal complet")
        if i != -1 and j != -1:
            j = html.rfind("<a", i, j)
            html = html[:i] + ('<div id="z-sel" class="divide-y '
                               'divide-surface-container-low flex flex-col"></div>') + html[j:]
    if cle == "selections":
        coupe("<!-- Horizontal Date Chips -->", "<!-- Segmented Filter Control -->",
              '<div id="z-chips" class="flex gap-2 overflow-x-auto pb-gutter-sm"></div>')
        TAB = ("filter-tab py-1.5 rounded text-center font-label-micro "
               "text-label-micro uppercase tracking-wider transition-all")
        ACT = TAB + " bg-surface-container-highest text-primary font-bold shadow-sm"
        INA = TAB + " text-outline hover:text-on-surface font-semibold"
        onglets = "".join(
            f'<button class="{ACT if k == "conseils" else INA}" data-tab="{k}">{lab}</button>'
            for k, lab in [("conseils", "Conseils"), ("safe", "SAFE"),
                           ("cote2", "Cote 2"), ("cote5", "Cote 5")])
        coupe("<!-- Segmented Filter Control -->", "<!-- Main Feed Area -->",
              '<div class="grid grid-cols-4 bg-surface-container-low p-0.5 '
              f'rounded-lg" id="v-tabs">{onglets}</div>')
        coupe("<!-- Card 1: Upcoming", "<!-- Section Header: COMBINÉS",
              '<div id="z-list"></div>')
        def fin_div(pos):
            # pos = juste après '<div' ; renvoie l'index juste après le </div> apparié
            d, k = 1, pos
            while d and k < len(html):
                no, nf = html.find("<div", k), html.find("</div>", k)
                if nf == -1:
                    break
                if no != -1 and no < nf:
                    d += 1; k = no + 4
                else:
                    d -= 1; k = nf + 6
            return k
        i = html.find("<!-- Section Header: COMBINÉS")
        if i != -1:
            ouv = html.find("<div", i)
            i = fin_div(ouv + 4)          # après la VRAIE fin du bloc titre
            j = html.find("Taux réel")
            if j != -1:
                j = html.rfind("<div", i, j)
                html = html[:i] + ('<div id="z-comb" class="flex flex-col '
                                   'gap-gutter-sm"></div>') + html[j:]
    if cle == "corners":
        coupe("<!-- Step 01 -->", "<!-- Terminal Progression Tracker Bar -->",
              '<div id="z-legs" class="flex flex-col gap-gutter-sm"></div>')
        html = re.sub(r'<span([^>]*)>1\.85</span>',
                      r'<span id="c-cote"\1>—</span>', html, count=1)
        html = re.sub(r'<span([^>]*)>54 %</span>',
                      r'<span id="c-proba"\1>—</span>', html, count=1)
    if cle == "accueil":
        html = re.sub(r'<span([^>]*)>78 %</span>',
                      r'<span id="a-hit"\1>—</span>', html, count=1)
    # ---- AUTH : format Bénin 01+8 chiffres, zéro valeur mock, zéro faux OTP
    if cle == "connexion":
        html = html.replace('value="97 42 88 19"', '')
        html = html.replace('value="QUANTUM_KEY_2024"', '')
        html = html.replace("loginInput.value = '97 42 88 19';", "loginInput.value = '';")
        html = html.replace("loginInput.value = 'analyste.quant@pronosfoot.bj';",
                            "loginInput.value = '';")
        html = html.replace("placeholder=\"97 00 00 00\"", "placeholder=\"01 97 48 29 46\"")
        html = html.replace("loginInput.placeholder = '97 00 00 00';",
                            "loginInput.placeholder = '01 97 48 29 46';")
    if cle == "inscription":
        html = html.replace('maxlength="11" placeholder="97 00 00 00"',
                            'maxlength="14" placeholder="01 97 48 29 46"')
        html = html.replace("if (raw.length > 8) raw = raw.substring(0, 8);",
                            "if (raw.length > 10) raw = raw.substring(0, 10);")
        html = html.replace("const prefix = raw.substring(0, 2);",
                            "const prefix = raw.replace(/^01/, '').substring(0, 2);")
        html = html.replace("const val = e.target.value.replace(/[^0-9]/g, '');",
                            "const val = e.target.value;")
        html = html.replace("strengthLabel.textContent = len + '/6 DGT';",
                            "strengthLabel.textContent = len >= 6 ? 'OK (' + len + ')' : len + '/6 MIN';")
        html = re.sub(r'(<input[^>]*id="pin-input"[^>]*?)inputmode="numeric"\s*',
                      r'\1', html)
        html = re.sub(r'(<input[^>]*id="pin-input"[^>]*?)maxlength="\d+"\s*',
                      r'\1', html)
        html = re.sub(r'\n\s*function handleRegistration\(\) \{.*?\n\s*\}\s*\n',
                      '\n', html, flags=re.S)
        html = html.replace("Recevoir le code OTP &amp; Créer mon compte", "Créer mon compte")
        html = html.replace("PASSAGE DIRECT OTP", "SANS CODE SMS")
        html = html.replace('onsubmit="event.preventDefault(); handleRegistration();"',
                            'onsubmit="event.preventDefault();"')
    if cle == "bilan":
        html = re.sub(r'<div([^>]*)>78 %</div>',
                      r'<div id="b-hit"\1>—</div>', html, count=1)
        html = re.sub(r'<div([^>]*)>\+2\.1 u</div>',
                      r'<div id="b-roi"\1>—</div>', html, count=1)
        html = html.replace("sélections touchées (43/55)",
                            '<span id="b-hit-cap">sélections touchées</span>')
        coupe("<!-- Monospace Columns Chart -->", "Le mois de janvier",
              '<div id="z-mois" class="flex items-end justify-between gap-2 '
              'px-gutter-base" style="height:160px"></div>', depuis_fin=True)
        coupe("<!-- Market 1: Under 2.5 -->", "<!-- Threshold Legend -->",
              '<div id="z-marches" class="flex flex-col gap-gutter-md"></div>')
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
