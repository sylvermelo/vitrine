/* ============================================================================
   VITRINE PRONOS FOOT — couche données & auth.
   Lit UNIQUEMENT ce qui existe déjà : tables Supabase `selections` et
   `combines` (écrites chaque heure par le robot), + Supabase Auth pour les
   pages de connexion. Aucune table créée, aucune donnée inventée : si la
   base est vide ou injoignable, l'écran le dit au lieu d'afficher du faux.
   Le design (classes Tailwind Stitch) est conservé : on remplace seulement
   le CONTENU des zones mock par du contenu réel, mêmes classes.
   ========================================================================== */
(function () {
  const CFG = window.VITRINE_CONFIG || {};
  const PAGE = document.body.dataset.page || "";
  let SB = null;

  /* ---------------------------------------------------------- utilitaires */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => x == null ? "—" : Math.round(x * 100) + " %";
  const f2 = (x) => x == null ? "—" : Number(x).toFixed(2);
  const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
  const aujourdHui = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);

  function feuilleParTexte(texte, exact) {
    for (const el of document.querySelectorAll("main *")) {
      if (el.children.length) continue;
      const t = (el.textContent || "").trim();
      if (exact ? t === texte : t.includes(texte)) return el;
    }
    return null;
  }
  function monte(leaf, reClasse) {
    let n = leaf;
    while (n && n !== document.body && !reClasse.test(n.className || "")) n = n.parentElement;
    return n === document.body ? null : n;
  }
  /* Remplace le CONTENEUR (parent de la carte repère) par une div vide id. */
  function zoneParRepere(texte, reClasse, id) {
    const leaf = feuilleParTexte(texte);
    if (!leaf) return null;
    const carte = monte(leaf, reClasse);
    if (!carte || !carte.parentElement) return null;
    const d = document.createElement("div");
    d.id = id;
    carte.parentElement.replaceChild(d, carte.parentElement.contains(carte) ? carte : carte);
    /* on a remplacé la carte seule ; il faut retirer les sœurs mock restantes */
    const parent = d.parentElement;
    [...parent.children].forEach((x) => { if (x !== d && x !== d.previousElementSibling) { /* noop */ } });
    return d;
  }
  /* Variante : remplace TOUT le conteneur parent (toutes les cartes mock). */
  function conteneurParRepere(texte, reClasse, id) {
    const leaf = feuilleParTexte(texte);
    if (!leaf) return null;
    const carte = monte(leaf, reClasse);
    if (!carte || !carte.parentElement) return null;
    const parent = carte.parentElement;
    const d = document.createElement("div");
    d.id = id;
    parent.parentElement.replaceChild(d, parent);
    return d;
  }
  /* Zone purgée au build (id) ; repli : ancien repère mock si HTML d'ancienne version en cache. */
  function zone(id, repere, reClasse) {
    const z = document.getElementById(id);
    if (z) return z;
    return repere ? conteneurParRepere(repere, reClasse, id) : null;
  }
  function setTexte(id, txt) {
    const el = document.getElementById(id);
    if (el) { el.textContent = txt; return true; }
    return false;
  }
  function majTexte(repere, nouveau, exact) {
    const leaf = feuilleParTexte(repere, exact);
    if (leaf) { leaf.textContent = nouveau; return true; }
    return false;
  }
  function banniere(msg) {
    const d = document.createElement("div");
    d.className = "err";
    d.style.margin = "0 0 4px";
    d.innerHTML = msg;
    const m = document.querySelector("main");
    if (m) m.prepend(d);
  }

  const NOMBEAU = {
    safe: "SAFE DU JOUR", safe_weekend: "SAFE WEEK-END", risque: "COMBINÉ RISQUE",
    cote2: "COTE 2 DU JOUR", cote5: "COTE 5 DU JOUR", fun: "COMBINÉ FUN",
    corners_montante: "COUPON CORNERS MONTANTE", safe_2: "SAFE 2 · RATTRAPAGE",
  };
  const nomBeau = (nom) => {
    if (NOMBEAU[nom]) return NOMBEAU[nom];
    const m = /^safe_(\d+)$/.exec(nom || "");
    return m ? `SAFE ${m[1]} · RATTRAPAGE` : (nom || "").replace(/_/g, " ");
  };
  async function sessionPret() {
    if (!SB) return;
    try {
      await new Promise((resolve) => {
        let fini = false;
        const term = () => { if (!fini) { fini = true;
          try { sub.subscription.unsubscribe(); } catch (e) {}
          resolve(); } };
        const { data: sub } = SB.auth.onAuthStateChange((ev) => {
          if (ev === "INITIAL_SESSION" || ev === "SIGNED_IN" || ev === "SIGNED_OUT") term();
        });
        setTimeout(term, 5000);            // filet : jamais bloqué plus de 5 s
      });
    } catch (e) {}
  }

  /* Accès conseillé : session ouverte + abonnement actif en base. */
  async function accesOk() {
    if (!SB) return { ok: false, raison: "anon" };
    try {
      const { data } = await SB.auth.getSession();
      if (!data || !data.session) return { ok: false, raison: "anon" };
      const r = await SB.from("abonnements").select("fin,plan")
        .eq("user_id", data.session.user.id).gte("fin", aujourdHui()).limit(1);
      if (r.error || !(r.data || []).length) return { ok: false, raison: "sans-abonnement" };
      return { ok: true };
    } catch (e) { return { ok: false, raison: "anon" }; }
  }

  function carteVerrou(raison) {
    return `<div class="lock">
      <div class="ic">🔒</div>
      <h2 style="margin:8px 0 6px">Contenu abonnés</h2>
      <div class="small ink2">${esc(raison || "Les conseils du jour — sélections, combinés, coupon corners — sont réservés aux abonnés.")}</div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
        <a class="btn" href="activation.html">Activer via WhatsApp</a>
        <a class="btn ghost" href="connexion.html">J'ai déjà un compte</a>
      </div></div>`;
  }

  function verrou(page) {
    const m = document.getElementById("z-contenu") || document.querySelector("main");
    if (m) m.innerHTML = carteVerrou(window.__ACC && window.__ACC.raison === "sans-abonnement"
      ? "Sélections, combinés et coupon corners sont réservés aux abonnés actifs (30 jours)."
      : undefined);
  }

  function ligneSelection(s) {
    const verdict = s.touche == null ? "" :
      `<span class="tiny ${s.touche ? "em" : "rd"}" style="font-weight:700">` +
      `${s.touche ? "✓ TOUCHÉE" : "✗ MANQUÉE"} ${s.buts_home ?? ""}-${s.buts_away ?? ""}</span>`;
    const live = s.touche == null ? badgeLive(s.div, s.home, s.away) : "";
    return `<div class="mrow">
      <div class="l">
        <div class="tiny mut">${esc((s.ligue || s.div || "").toUpperCase())} · ${esc(s.jour)}${s.heure ? " · " + esc(s.heure) : ""}</div>
        <div class="t" title="${esc(s.home)} vs ${esc(s.away)}">${esc(s.home)} <span class="mut">vs</span> ${esc(s.away)}</div>
        <div style="margin-top:3px"><span class="chip">${esc(s.option)}</span></div>
        <div style="margin-top:3px">${verdict}${live ? `<span class="live-score tiny cy" style="display:block" data-div="${esc(s.div || "")}" data-jour="${esc(s.jour || "")}" data-home="${esc(s.home || "")}" data-away="${esc(s.away || "")}">${esc(live)}</span>` : ""}</div>
      </div>
      <div class="r">
        <div class="pct em" style="font-family:var(--f-disp);font-weight:800;font-size:17px">${pct(s.p)}</div>
        <div class="tiny mut">cote juste ${f2(s.cote_juste)}</div>
        ${s.confiance ? `<div class="tiny mut">conf. ${esc(s.confiance)}</div>` : ""}
      </div></div>`;
  }

  function carteCombine(c) {
    const jambes = c.jambes || [];
    const resolues = jambes.filter((l) => l.resultat && l.resultat.touche != null);
    const perdues = resolues.filter((l) => !l.resultat.touche).length;
    const etat = c.touche != null
      ? (c.touche ? `<span class="pill em">✓ validé</span>` : `<span class="pill rd">✗ perdu</span>`)
      : perdues ? `<span class="pill rd">✗ perdu (${resolues.length}/${jambes.length})</span>`
      : resolues.length ? `<span class="pill am">en cours ${resolues.length}/${jambes.length}</span>`
      : `<span class="pill mu">en attente</span>`;
    const lignes = jambes.slice(0, 10).map((l) => {
      const r = l.resultat || {};
      const v = r.touche == null ? "" :
        ` <b class="${r.touche ? "em" : "rd"}">${r.touche ? "✓" : "✗"} ${r.buts_home ?? ""}-${r.buts_away ?? ""}</b>`;
      return `<div class="mrow"><div class="l"><div class="t small" title="${esc(l.home)} vs ${esc(l.away)}">${esc(l.home)} <span class="mut">vs</span> ${esc(l.away)}</div>
        <div class="tiny mut">${esc(l.option)}${v}</div></div>
        <div class="r">${l.p ? `<span class="pct small em">${pct(l.p)}</span>` : ""}</div></div>`;
    }).join("");
    const origine = (c.brut && c.brut.origine) ? `<div class="err small" style="margin-bottom:8px">${esc(c.brut.origine)}</div>` : "";
    return `<div class="card">
      <div class="hd"><span class="lbl ind">${esc(nomBeau(c.nom))}</span>${etat}</div>
      ${origine}
      <div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi"><div class="v num">${f2(c.cote)}</div><div class="d">cote totale</div></div>
        <div class="kpi"><div class="v num cy">${pct(c.p_combine)}</div><div class="d">proba combinée</div></div>
      </div>
      <div style="margin-top:6px">${lignes}</div></div>`;
  }

  async function charge() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY === "A_COLLER") {
      banniere("Vitrine non connectée : clé publique Supabase absente de assets/config.js.");
      return null;
    }
    /* Réessais (demande utilisateur 09/09) : une connexion mobile capricieuse
       ou un serveur Supabase lent ne doivent PLUS afficher le message d'erreur
       du premier coup — on tente 3 fois (attente ~1 s puis ~2 s) avant de se
       plaindre. */
    const ESSAIS = 3;
    for (let essai = 1; essai <= ESSAIS; essai++) {
      try {
        SB = SB || window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        const [sel, comb] = await Promise.all([
          SB.from("selections").select("*").order("jour", { ascending: false }).limit(400),
          SB.from("combines").select("*").order("jour", { ascending: false }).limit(500),
        ]);
        if (sel.error) throw sel.error;
        if (comb.error) throw comb.error;
        return { sel: sel.data || [], comb: comb.data || [] };
      } catch (e) {
        if (essai === ESSAIS) {
          banniere("Lecture Supabase impossible après " + ESSAIS + " tentatives : " +
            "vérifiez la connexion, ou collez les politiques RLS " +
            "(supabase/rls_vitrine.sql du repo robot) dans le SQL Editor, puis rechargez.");
          return null;
        }
        await new Promise((r) => setTimeout(r, 900 * essai));
      }
    }
  }

  /* ------------------------------------------- prix & promo (dynamique 10/09)
     Aucun prix codé en dur : tout vient de la table Supabase `parametres`
     (lecture publique). Si la table n'existe pas encore, valeurs par défaut
     du barème validé — rien ne casse, aucun message d'erreur. */
  const PARAM_DEFAUT = {
    prix: { mensuel_fcfa: 2500, duree_jours: 30, devise: "FCFA" },
    promo: { actif: false, prix_fcfa: null, jusquau: null },
    affiliation: { reduction_fcfa: 500, commission_premiere: 1000, commission_renouvellement: 500, seuil_paiement_fcfa: 2500 },
  };
  async function chargeParametres() {
    const P = JSON.parse(JSON.stringify(PARAM_DEFAUT));
    try {
      SB = SB || window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      const r = await SB.from("parametres").select("cle,valeur");
      if (!r.error && r.data) for (const row of r.data) {
        if (P[row.cle]) Object.assign(P[row.cle], row.valeur || {});
      }
    } catch (e) { /* silencieux : valeurs par défaut */ }
    P.promoActive = !!(P.promo.actif && P.promo.prix_fcfa && P.promo.jusquau &&
      String(P.promo.jusquau).slice(0, 10) >= aujourdHui());
    return P;
  }

  async function appliquerPrixPaiement() {
    const main = document.querySelector("main");
    if (!main) return;
    const P = await chargeParametres();
    const prixNormal = Number(P.prix.mensuel_fcfa) || 2500;
    const prixFinal = P.promoActive ? Number(P.promo.prix_fcfa) : prixNormal;
    /* Remplace le prix écrit en dur dans la maquette (« 5 000 FCFA ») par le
       prix réel, partout où il apparaît dans la page. */
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const cibles = [];
    let nd;
    while ((nd = walk.nextNode())) if (/\b5\s*000\s*FCFA\b/.test(nd.nodeValue)) cibles.push(nd);
    for (const t of cibles) t.nodeValue = t.nodeValue.replace(/\b5\s*000(\s*FCFA)\b/g, nf(prixFinal) + "$1");
    if (P.promoActive) {
      const b = document.createElement("div");
      b.className = "mx-gutter-base mt-gutter-base rounded-xl p-gutter-base " +
        "bg-secondary-container/25 border border-secondary/50 text-on-surface font-body-sm text-body-sm";
      b.innerHTML = "🔥 <b>PROMOTION : " + nf(prixFinal) + " FCFA</b> / 30 jours " +
        "<s style='opacity:.55'>" + nf(prixNormal) + " FCFA</s> — jusqu'au <b>" +
        esc(dateFr(String(P.promo.jusquau).slice(0, 10))) + "</b> inclus.";
      main.prepend(b);
    }
  }

  /* ------------------------------------------------ scores en direct (10/09)
     Demande : « rafraîchissement des scores/résultats toutes les 30 min si le
     quota le permet ». Réponse : ce rafraîchissement se fait dans le
     NAVIGATEUR du visiteur, en appelant ESPN directement (API publique sans
     clé, CORS ouvert — vérifié le 10/09). Coût : 0 minute GitHub Actions,
     0 crédit The Odds API. Affichage uniquement : la validation officielle
     (touche/manquée, coupons) reste le travail du robot, chaque heure. */
  const ESPN_SLUGS = {
    E0: "eng.1", E1: "eng.2", E2: "eng.3", E3: "eng.4",
    SC0: "sco.1", SC1: "sco.2", SC2: "sco.3", SC3: "sco.4",
    B1: "bel.1", N1: "ned.1", D1: "ger.1", D2: "ger.2",
    F1: "fra.1", F2: "fra.2", I1: "ita.1", I2: "ita.2",
    SP1: "esp.1", SP2: "esp.2", P1: "por.1", T1: "tur.1", G1: "gre.1",
    UCL: "uefa.champions", UEL: "uefa.europa", UECL: "uefa.europa.conf",
    CAR: "eng.league_cup", CDR: "esp.copa_del_rey", CDI: "ita.coppa_italia",
    DFP: "ger.dfb_pokal", CDF: "fra.coupe_de_france",
  };
  const SUFFIXES_EQ = ["town", "city", "united", "wanderers", "rovers", "athletic",
    "county", "north end", "albion", "fc", "afc", "cf", "sk", "bk", "sc", "sv",
    "vfl", "vfb", "ac", "as", "ss", "rc", "sl", "kv", "ksc", "bsc", "fk", "ik",
    "if", "amsterdam", "foot"];

  function normEq(s) {
    let x = String(s || "").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    for (const sfx of SUFFIXES_EQ) {
      if (x.endsWith(" " + sfx)) {
        const c = x.slice(0, x.length - sfx.length - 1).trim();
        if (c.length >= 3) x = c;
      }
    }
    return x;
  }
  const memeEquipe = (a, b) => {
    const x = normEq(a), y = normEq(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  };
  let LIVE_CACHE = [];
  let LIVE_TIMER = null;
  function badgeLive(div, home, away) {
    const d = String(div || "").toUpperCase();
    const m = LIVE_CACHE.find((x) => x.div === d && memeEquipe(x.h, home) && memeEquipe(x.a, away));
    if (!m) return "";
    if (m.state === "in" && m.bh != null) return "⚽ direct " + m.bh + "-" + m.ba + " · " + m.short;
    if (m.state === "post" && m.bh != null) return "⚽ terminé " + m.bh + "-" + m.ba + " (validation en attente)";
    if (m.state === "pre") return "coup d'envoi " + m.short;
    return "";
  }
  async function majScoresLive() {
    const badges = [...document.querySelectorAll(".live-score")];
    if (!badges.length) return;
    const auj = aujourdHui();
    const cibles = badges.filter((b) => b.dataset.jour === auj && ESPN_SLUGS[String(b.dataset.div || "").toUpperCase()]);
    if (!cibles.length) return;
    const divs = [...new Set(cibles.map((b) => String(b.dataset.div).toUpperCase()))];
    const ymd = auj.replace(/-/g, "");
    const parDiv = await Promise.all(divs.map(async (d) => {
      try {
        const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/" +
          ESPN_SLUGS[d] + "/scoreboard?dates=" + ymd);
        if (!r.ok) return [];
        const j = await r.json();
        return (j.events || []).map((e) => {
          const comp = (e.competitions || [{}])[0];
          let h = null, a = null, bh = null, ba = null;
          for (const co of comp.competitors || []) {
            const nom = (co.team || {}).displayName;
            const buts = parseInt(co.score, 10);
            if (co.homeAway === "home") { h = nom; bh = isNaN(buts) ? null : buts; }
            else if (co.homeAway === "away") { a = nom; ba = isNaN(buts) ? null : buts; }
          }
          const st = ((e.status || {}).type) || {};
          return {
            div: d, h, a, bh, ba, state: st.state || "",
            short: st.shortDetail || (e.status || {}).displayValue || "",
          };
        }).filter((m) => m.h && m.a);
      } catch (e) { return []; }
    }));
    LIVE_CACHE = parDiv.flat();
    for (const b of cibles) {
      const txt = badgeLive(b.dataset.div, b.dataset.home, b.dataset.away);
      b.textContent = txt;
      b.style.display = txt ? "block" : "none";
    }
  }
  function demarrerLive() {
    majScoresLive();
    if (LIVE_TIMER) clearInterval(LIVE_TIMER);
    LIVE_TIMER = setInterval(majScoresLive, 30 * 60 * 1000);   /* toutes les 30 min */
    document.addEventListener("visibilitychange", () => { if (!document.hidden) majScoresLive(); });
  }

  /* ---------------------------------------------------------- pages */
  const CARTE = /rounded-xl/;
  const LIGNE = /p-gutter-base/;

  const hier = () => new Date(Date.now() + 3600000 - 86400000).toISOString().slice(0, 10);
  const dateFr = (j) => { try {
    return new Date(j + "T12:00:00Z").toLocaleDateString("fr-FR",
      { weekday: "long", day: "numeric", month: "long" });
  } catch (e) { return j; } };
  const estSafe = (c) => (c.nom || "").toLowerCase().includes("safe");

  /* Carte « HIER » : résultat du SAFE de la veille, conseils touchés la
     veille, SAFE passés depuis le lancement. Données 100 % réelles (tables
     selections/combines) — si rien n'est archivé, la carte le dit. */
  function carteVeille(D) {
    const h = hier();
    const sel = D.sel.filter((s) => (s.jour || "") === h && s.touche != null);
    const safe = D.comb.filter((c) => estSafe(c) && (c.jour || "") === h)[0];
    if (!sel.length && !safe) {
      return `<div class="card"><div class="hd"><span class="lbl">Hier — ${esc(dateFr(h))}</span></div>
        <div class="small mut">Rien d'archivé pour la veille : le robot n'avait rien proposé,
        ou les résultats ne sont pas encore résolus.</div></div>`;
    }
    const t = sel.filter((s) => s.touche).length;
    const etatSafe = safe ? (safe.touche == null ? `<span class="pill am">en cours</span>`
      : safe.touche ? `<span class="pill em">✓ safe validé</span>` : `<span class="pill rd">✗ safe manqué</span>`) : "";
    return `<div class="card"><div class="hd"><span class="lbl">Hier — ${esc(dateFr(h))}</span>${etatSafe}</div>
      <div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi"><div class="v num ${t === sel.length && sel.length ? "em" : ""}">${t}/${sel.length || 0}</div><div class="d">conseils touchés</div></div>
        <div class="kpi"><div class="v num">${sel.length ? Math.round(100 * t / sel.length) + " %" : "—"}</div><div class="d">réussite du jour</div></div>
      </div>
      <div style="margin-top:4px">${sel.map((s) => `<div class="mrow"><div class="l">
        <div class="t small" title="${esc(s.home)} vs ${esc(s.away)}">${esc(s.home)} <span class="mut">vs</span> ${esc(s.away)}</div>
        <div class="tiny mut">${esc(s.option)}</div></div>
        <div class="r"><b class="${s.touche ? "em" : "rd"}">${s.touche ? "✓" : "✗"} ${s.buts_home ?? ""}-${s.buts_away ?? ""}</b></div></div>`).join("")}</div></div>`;
  }

  /* ---------------------------------------------- coquille (header + nav) */
  const ICONES = {
    accueil: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z"/></svg>',
    selections: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    corners: '<svg viewBox="0 0 24 24"><path d="M5 21V4h5l1 3h8"/></svg>',
    series: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    bilan: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>',
  };
  const NAV = [["accueil", "index.html", "Accueil"], ["selections", "selections.html", "Sélections"],
    ["corners", "corners.html", "Corners"], ["series", "series.html", "Séries"],
    ["bilan", "bilan.html", "Bilan"]];

  function coquille() {
    const h = document.getElementById("hdr");
    if (h) h.innerHTML = `<div class="in">
      <div class="brand"><img src="assets/logo.png" alt="Pronos Foot">
        <div style="min-width:0"><div class="t1">PRONOS<b>FOOT</b></div>
        <div class="t2"><span class="dot"></span>robot mathématique · sync</div></div></div>
      <button id="v-compte" class="hbtn" title="Connexion" aria-label="Compte">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
      </button></div>`;
    const n = document.getElementById("bnav");
    if (n) n.innerHTML = `<div class="in">${NAV.map(([id, href, lb]) =>
      `<a href="${href}" class="${PAGE === id ? "on" : ""}">${ICONES[id]}<span>${lb}</span></a>`).join("")}</div>`;
  }

  /* ---------------------------------------------------------- accueil */
  function pageAccueil(D) {
    const z = document.getElementById("z-contenu");
    if (!z) return;
    const resolues = D.sel.filter((s) => s.touche != null);
    const touches = resolues.filter((s) => s.touche).length;
    const taux = resolues.length ? Math.round(100 * touches / resolues.length) : null;
    const auj = new Date().toISOString().slice(0, 10);
    const duJour = D.sel.filter((s) => (s.jour || "") === auj);
    const vol = (D.bilan && D.bilan.volume) || {};
    z.innerHTML = `
      <div class="card foc">
        <div class="hd"><span class="lbl">Terminal du jour</span><span class="pill cy"><span class="dot"></span>sync</span></div>
        <h1 style="font-size:1.45rem">Le robot mathématique<br>du football</h1>
        <div class="small ink2" style="margin:6px 0 12px">Moteur Dixon-Coles calibré en walk-forward sur
          des dizaines de milliers de matchs réels. Pas d'intelligence artificielle : des probabilités
          mesurées, des limites affichées, aucune promesse de gain.</div>
        <div class="kpis">
          <div class="kpi"><div class="v num">${vol.total_matchs ? vol.total_matchs.toLocaleString("fr-FR") : "—"}</div><div class="d">matchs réels en base</div></div>
          <div class="kpi"><div class="v num ${taux != null ? "em" : ""}">${taux != null ? taux + " %" : "—"}</div><div class="d">conseils touchés (${touches}/${resolues.length})</div></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <a class="btn" href="selections.html">Voir les sélections du jour</a>
          <a class="btn ghost" href="series.html">Buts d'affilée — nouveau</a>
        </div>
      </div>
      <div class="card"><div class="hd"><span class="lbl">Aujourd'hui</span>
        <span class="pill ind">${duJour.length} conseil${duJour.length > 1 ? "s" : ""}</span></div>
        ${duJour.length ? duJour.slice(0, 4).map(ligneSelection).join("")
        : `<div class="small mut">Aucun conseil aujourd'hui : aucun match n'atteint les seuils
           mesurés. Le robot s'abstient plutôt que de forcer — ce n'est pas un bug.</div>`}
      </div>
      ${carteVeille(D)}
      <div id="z-series-teaser"></div>
      <div id="z-corners-teaser"></div>`;
    teaserSeries();
    const cp = D.comb.filter((c) => c.nom === "corners_montante")
      .sort((a, b) => (b.jour || "").localeCompare(a.jour || ""))[0];
    const zc = document.getElementById("z-corners-teaser");
    if (zc) zc.innerHTML = cp ? `<div class="card"><div class="hd"><span class="lbl">Coupon corners montante</span>
        <span class="pill em">actif</span></div>
        <div class="mrow"><div class="l"><div class="t">${(cp.jambes || []).length} jambes · ${esc(cp.jour || "")}</div>
        <div class="tiny mut">chaque jambe ≥ 85 % de fréquence réelle mesurée</div></div>
        <div class="r"><div class="num em" style="font-family:var(--f-disp);font-weight:800;font-size:17px">${f2(cp.cote)}</div>
        <div class="tiny mut">proba ${pct(cp.p_combine)}</div></div></div>
        <a class="btn ghost" style="margin-top:10px" href="corners.html">Ouvrir le coupon corners</a></div>`
      : `<div class="card"><div class="hd"><span class="lbl">Coupon corners montante</span></div>
         <div class="small mut">Pas de coupon corners aujourd'hui : aucun match n'atteint 85 % de
         fréquence réelle mesurée. Mieux vaut sauter un jour que forcer.</div></div>`;
  }

  function teaserSeries() {
    const z = document.getElementById("z-series-teaser");
    if (!z) return;
    chargeSeries().then((S) => {
      if (!S || !S.matchs || !S.matchs.length) {
        z.innerHTML = `<div class="card"><div class="hd"><span class="lbl">Buts d'affilée</span></div>
          <div class="small mut">Pas de match aujourd'hui dans le calendrier du robot.</div></div>`;
        return;
      }
      const top = S.matchs.slice(0, 3);
      z.innerHTML = `<div class="card hi"><div class="hd"><span class="lbl">Buts d'affilée — aujourd'hui</span>
        <span class="pill cy">nouveau</span></div>
        ${top.map((m) => `<div class="mrow"><div class="l">
          <div class="t" title="${esc(m.home)} vs ${esc(m.away)}">${esc(m.home)} <span class="mut">vs</span> ${esc(m.away)}</div>
          <div class="tiny mut">${esc(m.ligue)}${m.heure ? " · " + esc(m.heure) : ""}</div></div>
          <div class="r"><div class="tiny mut">2 d'affilée : <b class="ink2">non</b></div>
          <div class="num em" style="font-family:var(--f-disp);font-weight:800;font-size:16px">${pct(1 - m.s2)}</div></div></div>`).join("")}
        <div class="tiny mut" style="margin-top:8px">« non » = aucune équipe ne marque 2 buts de suite.
          Information chiffrée, jamais un conseil.</div>
        <a class="btn ghost" style="margin-top:10px" href="series.html">Tout voir : match, domicile, extérieur</a></div>`;
    });
  }

  /* ---------------------------------------------------------- séries */
  let SERIES_CACHE = null;
  function chargeSeries() {
    if (SERIES_CACHE) return Promise.resolve(SERIES_CACHE);
    return fetch("../pronos-foot/series_jour.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { SERIES_CACHE = d; return d; })
      .catch(() => null);
  }

  function pageSeries() {
    const z = document.getElementById("z-contenu");
    if (!z) return;
    z.innerHTML = `<div class="card"><div class="hd"><span class="lbl">Chargement…</span></div>
      <div class="small mut">Lecture des probabilités du jour.</div></div>`;
    chargeSeries().then((S) => {
      if (!S) {
        z.innerHTML = `<div class="err">Impossible de lire les séries du jour
          (fichier robot injoignable). Réessayez dans quelques minutes.</div>`;
        return;
      }
      const liste = (S.matchs || []).length
        ? { titre: "Matchs du jour — " + (S.jour || ""), matchs: S.matchs }
        : (S.prochain_jour && (S.prochain_jour.matchs || []).length)
          ? { titre: "Prochain jour — " + S.prochain_jour.date + " (ceux du jour sont déjà commencés)", matchs: S.prochain_jour.matchs }
          : { titre: "Matchs du jour — " + (S.jour || ""), matchs: [] };
      const nonOui = (x) => x == null ? `<span class="mut">—</span>`
        : `<b class="ink2 num">${pct(1 - x)}</b><div class="tiny mut">oui ${pct(x)}</div>`;
      const ligne = (m) => `<tr>
        <td class="tiny">${esc(m.heure || "—")}</td>
        <td class="tname" title="${esc(m.home)} vs ${esc(m.away)}">${esc(m.home)} – ${esc(m.away)}<div class="tiny mut">${esc(m.ligue)}</div></td>
        <td class="n">${nonOui(m.s2)}</td><td class="n">${nonOui(m.s3)}</td>
        <td class="n">${nonOui(m.s2d)}</td><td class="n">${nonOui(m.s2e)}</td></tr>`;
      const safe = S.safe && S.safe.length ? `<div class="card foc"><div class="hd">
          <span class="lbl em">Safe du jour — buts d'affilée</span>
          <span class="pill em">${S.safe.length} jambe${S.safe.length > 1 ? "s" : ""}</span></div>
        ${S.safe.map((l) => `<div class="mrow"><div class="l">
          <div class="t" title="${esc(l.home)} vs ${esc(l.away)}">${esc(l.home)} <span class="mut">vs</span> ${esc(l.away)}</div>
          <div class="tiny mut">${esc(l.heure || "")} · ${esc(l.ligue)} · <span class="em">${esc(l.option)} · ${esc(l.fiche)}</span></div></div>
          <div class="r"><div class="num em" style="font-family:var(--f-disp);font-weight:800;font-size:16px">${pct(1 - l.p)}</div>
          <div class="tiny mut">non · oui ${pct(l.p)}</div></div></div>`).join("")}</div>`
        : `<div class="card"><div class="hd"><span class="lbl em">Safe du jour — buts d'affilée</span>
          <span class="lbl">0</span></div><div class="small mut">Aucun match des 5 grands championnats
          n'atteint aujourd'hui les seuils mesurés (2+ match ≥ 75 % ou 2+ domicile ≥ 70 %).
          Le robot s'abstient plutôt que de forcer.</div></div>`;
      const gc = S.grosse_cote && S.grosse_cote.legs && S.grosse_cote.legs.length
        ? `<div class="card"><div class="hd"><span class="lbl am">Combiné grosse cote — buts d'affilée</span>
          <span class="pill am">cote juste ${f2(S.grosse_cote.cote_juste)}</span></div>
          ${S.grosse_cote.legs.map((l) => `<div class="mrow"><div class="l">
            <div class="t" title="${esc(l.home)} vs ${esc(l.away)}">${esc(l.home)} <span class="mut">vs</span> ${esc(l.away)}</div>
            <div class="tiny mut">${esc(l.option)} · juste @ ${f2(l.cote_juste)}</div></div>
            <div class="r"><span class="num am small">${pct(l.p)}</span></div></div>`).join("")}
          <div class="tiny mut" style="margin-top:8px">Proba combinée ${pct(S.grosse_cote.p_combine)}
            (indépendance supposée). Billet de loterie assumé : environ 1 chance sur
            ${Math.round(S.grosse_cote.cote_juste)}.</div></div>`
        : `<div class="card"><div class="hd"><span class="lbl am">Combiné grosse cote — buts d'affilée</span>
          <span class="lbl">0</span></div><div class="small mut">Pas assez de jambes « 3 buts d'affilée »
          ≥ 10 % aujourd'hui pour la cible de cote juste 20 à 50. Jamais forcé.</div></div>`;
      z.innerHTML = `
        <div class="warn"><b>Information chiffrée, jamais un conseil.</b> Probabilités de séries de
          buts d'affilée (même équipe, sans but adverse entre-temps), biais mesurés puis corrigés sur
          2 923 matchs réels (2 saisons, 5 grands championnats). <b>NON</b> = la série ne se produit
          pas. Aucun bookmaker de nos sources ne propose ces marchés : rien dans le coupon ni le suivi.</div>
        <div class="card"><div class="hd"><span class="lbl">${esc(liste.titre)}</span>
          <span class="pill cy">${liste.matchs.length}</span></div>
          ${liste.matchs.length ? `<div class="scrollx"><table class="tbl"><thead><tr>
            <th>H</th><th>Match</th><th class="n">2·match</th><th class="n">3·match</th>
            <th class="n">2·dom</th><th class="n">2·ext</th></tr></thead>
            <tbody>${liste.matchs.map(ligne).join("")}</tbody></table></div>
            <div class="tiny mut" style="margin-top:6px">Chiffre gras = NON (la série n'arrive pas) ;
            dessous = oui. Hors Big 5 ou coupes : affiché, jamais dans le safe ni le combiné.</div>`
          : `<div class="small mut">Aucun match aujourd'hui dans le calendrier du robot.</div>`}
        </div>
        ${safe}${gc}`;
    });
  }

  /* ---------------------------------------------------------- selections */
  function pageSelections(D) {
    const z = document.getElementById("z-contenu");
    if (!z) return;
    const auj = new Date().toISOString().slice(0, 10);
    const duJour = D.sel.filter((s) => (s.jour || "") === auj);
    const aVenir = D.sel.filter((s) => (s.jour || "") > auj && s.touche == null);
    const combis = D.comb.filter((c) => (c.jour || "") >= hier());
    z.innerHTML = `
      <div class="card hi"><div class="hd"><span class="lbl">Sélections du jour</span>
        <span class="pill ind">${duJour.length}</span></div>
        ${duJour.length ? duJour.map(ligneSelection).join("")
        : `<div class="small mut">Aucune sélection aujourd'hui : aucun match n'atteint le seuil
           choisi. Le robot s'abstient — probabilité ≠ gain garanti.</div>`}
      </div>
      ${aVenir.length ? `<div class="card"><div class="hd"><span class="lbl">À venir</span>
        <span class="pill mu">${aVenir.length}</span></div>
        ${aVenir.slice(0, 8).map(ligneSelection).join("")}</div>` : ""}
      <div class="sect"><span class="lbl">Combinés du robot</span><span class="line"></span></div>
      ${combis.length ? combis.map(carteCombine).join("")
        : `<div class="empty">Aucun combiné en cours.</div>`}
      <div class="warn" style="margin-top:4px">Sélections issues du moteur calibré walk-forward.
        Probabilités ≠ certitudes : aucune promesse de gain. Divisions instables exclues sous 85 %
        (conseils) et 90 % (SAFE/combinés), coupes jamais dans les sélections suivies.</div>`;
  }

  /* ---------------------------------------------------------- corners */
  function pageCorners(D) {
    const z = document.getElementById("z-contenu");
    if (!z) return;
    const cp = D.comb.filter((c) => c.nom === "corners_montante")
      .sort((a, b) => (b.jour || "").localeCompare(a.jour || ""))[0];
    if (!cp) {
      z.innerHTML = `<div class="card"><div class="hd"><span class="lbl em">Coupon corners montante</span>
        <span class="lbl">0</span></div>
        <div class="small ink2">Aucun coupon ce jour : aucun match n'atteint 85 % de fréquence réelle
        mesurée sur son meilleur handicap corners. Mieux vaut sauter un jour que forcer —
        discipline algorithmique absolue.</div></div>
        ${carteCalibCorners()}`;
      return;
    }
    let mise = 1;
    const jambes = (cp.jambes || []).map((l, i) => {
      const c = l.cote || (l.p_cal ? 1 / l.p_cal : null);
      const apres = c ? mise * c : null;
      const html = `<div class="card">
        <div class="hd"><span class="lbl ind">${String(i + 1).padStart(2, "0")} · ${esc(l.heure || "")}</span>
          <span class="pill mu">${esc(String(l.ligue || "").slice(0, 14))}</span></div>
        <div class="t" style="font-family:var(--f-disp);font-weight:700;font-size:16px"
          title="${esc(l.home)} vs ${esc(l.away)}">${esc(l.home)} <span class="mut">vs</span> ${esc(l.away)}</div>
        <div style="margin:6px 0"><span class="chip">${esc(l.option)}</span></div>
        <div class="mrow"><div class="l tiny mut">annonce <s>${pct(l.p_brut)}</s> →
          <span class="em">${pct(l.p_cal)}</span></div>
          <div class="r tiny mut">cote juste <b class="ink2 num">${f2(c)}</b></div></div>
        <div class="tiny mut">mise ${f2(mise)} u → <b class="ink2 num">${f2(apres)}</b> u</div>
        <div class="bar"><i style="width:${Math.round((l.p_cal || 0) * 100)}%"></i></div></div>`;
      if (c) mise = apres;
      return html;
    }).join("");
    z.innerHTML = `
      <div class="card foc"><div class="hd"><span class="lbl em">Coupon montante — ${esc(cp.jour || "")}</span>
        <span class="pill em"><span class="dot"></span>active run</span></div>
        <div class="kpis">
          <div class="kpi"><div class="v num">${f2(cp.cote)}</div><div class="d">cote totale composée</div></div>
          <div class="kpi"><div class="v num em">${pct(cp.p_combine)}</div><div class="d">proba combinée calibrée</div></div>
        </div>
        <div class="ok small" style="margin-top:10px">Tous les bons matchs du jour, dans l'ordre
        chronologique des coups d'envoi — même jour uniquement, jamais de report ni d'enjambement
        de session.</div></div>
      ${jambes}
      <div class="card hi"><div class="hd"><span class="lbl em">Objectif montante</span></div>
        <div class="num em" style="font-family:var(--f-disp);font-weight:800;font-size:1.3rem">
        Si tout passe : ${f2(mise)} u récupérées</div></div>
      ${carteCalibCorners()}`;
  }

  function carteCalibCorners() {
    return `<div class="card"><div class="hd"><span class="lbl">Calibration des modèles corners</span></div>
      <div class="small ink2">Probabilités <b>calibrées</b> en walk-forward sur les données
      football-data.co.uk : le modèle brut surestimait la domination corners (victoire annoncée
      92 % → réalisée 79 %). Tous les pronostics corners intègrent cette décote de variance
      structurelle. La 1re mi-temps n'entre jamais dans le safe (mesuré : 54 % de victoire sèche
      en moyenne).</div>
      <div class="tiny mut" style="margin-top:8px">Règle de sécurité : aucun coupon si aucun match
      n'atteint 85 % de fréquence réelle mesurée aujourd'hui. Discipline algorithmique absolue.</div></div>`;
  }

  /* ---------------------------------------------------------- bilan */
  function pageBilan(D) {
    const z = document.getElementById("z-contenu");
    if (!z) return;
    const resolues = D.sel.filter((s) => s.touche != null);
    const touches = resolues.filter((s) => s.touche).length;
    const taux = resolues.length ? Math.round(100 * touches / resolues.length) : null;
    let roi = 0, n = 0;
    for (const s of resolues) {
      if (s.cote_marche == null) continue;
      roi += s.touche ? s.cote_marche - 1 : -1; n++;
    }
    const parMois = {};
    for (const s of resolues) {
      const m = (s.jour || "").slice(0, 7);
      (parMois[m] = parMois[m] || { t: 0, n: 0 });
      parMois[m].n++; if (s.touche) parMois[m].t++;
    }
    const mois = Object.keys(parMois).sort().slice(-6);
    const vol = (D.bilan && D.bilan.volume) || {};
    z.innerHTML = `
      <div class="card foc"><div class="hd"><span class="lbl">Transparence & bilan réel</span>
        <span class="pill cy">données archivées</span></div>
        <h1 style="font-size:1.3rem">Ce que le robot a vraiment touché</h1>
        <div class="small ink2" style="margin:6px 0 12px">Chaque sélection est archivée puis résolue
        sur les scores réels. Rien n'est effacé, rien n'est réécrit : les matchs manqués restent
        affichés.</div>
        <div class="kpis">
          <div class="kpi"><div class="v num ${taux != null ? "em" : ""}">${taux != null ? taux + " %" : "—"}</div>
            <div class="d">conseils touchés (${touches}/${resolues.length})</div></div>
          <div class="kpi"><div class="v num ${roi >= 0 ? "em" : "rd"}">${(roi >= 0 ? "+" : "") + roi.toFixed(1)} u</div>
            <div class="d">ROI sur ${n} sélections cotées</div></div>
          <div class="kpi"><div class="v num">${vol.total_matchs ? vol.total_matchs.toLocaleString("fr-FR") : "—"}</div>
            <div class="d">matchs réels en base</div></div>
          <div class="kpi"><div class="v num">${D.comb.length}</div><div class="d">combinés archivés</div></div>
        </div></div>
      ${mois.length ? `<div class="card"><div class="hd"><span class="lbl">Historique mensuel</span></div>
        <div style="display:flex;gap:8px;align-items:flex-end;height:120px">
        ${mois.map((m) => {
          const r = parMois[m], t = Math.round(100 * r.t / r.n);
          const nom = new Date(m + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "short" });
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%">
            <span class="tiny ${t >= 75 ? "ink2" : "cy"}">${t}%</span>
            <div style="width:100%;border-radius:4px 4px 0 0;height:${Math.max(12, t)}%;background:${t >= 75 ? "var(--em)" : "var(--cy)"}"></div>
            <span class="tiny mut">${nom}</span></div>`;
        }).join("")}</div></div>` : ""}
      <div class="card"><div class="hd"><span class="lbl">Dernières sélections résolues</span></div>
        ${resolues.length ? `<div class="scrollx"><table class="tbl"><thead><tr>
          <th>Jour</th><th>Match</th><th>Option</th><th class="n">Score</th><th class="n">Verdict</th></tr></thead>
          <tbody>${resolues.slice(-14).reverse().map((s) => `<tr>
            <td class="tiny">${esc((s.jour || "").slice(5))}</td>
            <td class="tname" title="${esc(s.home)} vs ${esc(s.away)}">${esc(s.home)}–${esc(s.away)}</td>
            <td class="tiny">${esc(s.option)}</td>
            <td class="n tiny">${s.buts_home}-${s.buts_away}</td>
            <td class="n"><b class="${s.touche ? "em" : "rd"}">${s.touche ? "✓" : "✗"}</b></td></tr>`).join("")}
          </tbody></table></div>` : `<div class="small mut">Rien de résolu pour l'instant.</div>`}
      </div>
      <div class="warn">Bilan réel, pas simulé : mais un bon passé ne prédit pas l'avenir.
        Les probabilités restent des probabilités — aucune promesse de gain.</div>`;
  }

  const PAYS_AFRIQUE = [
    ["🇧🇯", "Bénin", "229", 10, 10, "^01"],
    ["🇩🇿", "Algérie", "213", 9, 9],
    ["🇦🇴", "Angola", "244", 9, 9],
    ["🇿🇦", "Afrique du Sud", "27", 9, 9],
    ["🇧🇼", "Botswana", "267", 7, 8],
    ["🇧🇫", "Burkina Faso", "226", 8, 8],
    ["🇧🇮", "Burundi", "257", 8, 8],
    ["🇨🇲", "Cameroun", "237", 8, 9],
    ["🇨🇻", "Cap-Vert", "238", 7, 7],
    ["🇨🇫", "Centrafrique", "236", 8, 8],
    ["🇰🇲", "Comores", "269", 7, 7],
    ["🇨🇬", "Congo-Brazzaville", "242", 9, 9],
    ["🇨🇩", "Congo-Kinshasa (RDC)", "243", 7, 9],
    ["🇨🇮", "Côte d'Ivoire", "225", 10, 10, "^0"],
    ["🇩🇯", "Djibouti", "253", 8, 8],
    ["🇪🇬", "Égypte", "20", 10, 10],
    ["🇪🇷", "Érythrée", "291", 7, 7],
    ["🇸🇿", "Eswatini", "268", 8, 8],
    ["🇪🇹", "Éthiopie", "251", 9, 9],
    ["🇬🇦", "Gabon", "241", 7, 8],
    ["🇬🇲", "Gambie", "220", 7, 7],
    ["🇬🇭", "Ghana", "233", 9, 9],
    ["🇬🇳", "Guinée", "224", 8, 8],
    ["🇬🇼", "Guinée-Bissau", "245", 7, 7],
    ["🇬🇶", "Guinée équatoriale", "240", 9, 9],
    ["🇰🇪", "Kenya", "254", 9, 9],
    ["🇱🇸", "Lesotho", "266", 8, 8],
    ["🇱🇷", "Liberia", "231", 7, 9],
    ["🇱🇾", "Libye", "218", 9, 9],
    ["🇲🇬", "Madagascar", "261", 9, 9],
    ["🇲🇼", "Malawi", "265", 7, 9],
    ["🇲🇱", "Mali", "223", 8, 8],
    ["🇲🇦", "Maroc", "212", 9, 9],
    ["🇲🇷", "Mauritanie", "222", 8, 8],
    ["🇲🇺", "Maurice", "230", 7, 8],
    ["🇲🇿", "Mozambique", "258", 8, 9],
    ["🇳🇦", "Namibie", "264", 8, 9],
    ["🇳🇪", "Niger", "227", 8, 8],
    ["🇳🇬", "Nigeria", "234", 10, 10],
    ["🇺🇬", "Ouganda", "256", 9, 9],
    ["🇷🇼", "Rwanda", "250", 9, 9],
    ["🇷🇪", "Réunion", "262", 9, 9],
    ["🇸🇹", "Sao Tomé-et-Principe", "239", 7, 7],
    ["🇸🇳", "Sénégal", "221", 9, 9],
    ["🇸🇨", "Seychelles", "248", 6, 7],
    ["🇸🇱", "Sierra Leone", "232", 8, 8],
    ["🇸🇴", "Somalie", "252", 7, 9],
    ["🇸🇩", "Soudan", "249", 9, 9],
    ["🇸🇸", "Soudan du Sud", "211", 9, 9],
    ["🇹🇿", "Tanzanie", "255", 9, 9],
    ["🇹🇩", "Tchad", "235", 8, 8],
    ["🇹🇬", "Togo", "228", 8, 8],
    ["🇹🇳", "Tunisie", "216", 8, 8],
    ["🇿🇲", "Zambie", "260", 9, 9],
    ["🇿🇼", "Zimbabwe", "263", 7, 9],
  ];
  let paysSel = PAYS_AFRIQUE[0];

  function paysParCc(dd) {
    for (const L of [3, 2, 1]) {
      const p = PAYS_AFRIQUE.find((x) => x[2] === dd.slice(0, L));
      if (p) return p;
    }
    return null;
  }
  function nsnOk(p, n) { return n.length >= p[3] && n.length <= p[4]; }
  /* Retourne "<cc><numéro>" ou null. Accepte le 0 initial (préfixe national)
     sauf quand il fait partie du numéro (Bénin 01…, Côte d'Ivoire 0…). */
  function normTelPays(p, brut) {
    let n = String(brut || "").replace(/[\s.\-()]/g, "").replace(/^\+/, "");
    if (n.length > p[2].length && n.startsWith(p[2])) n = n.slice(p[2].length);
    const valide = (x) => nsnOk(p, x) && (!p[5] || new RegExp(p[5]).test(x));
    if (valide(n)) return p[2] + n;
    const s = n.replace(/^0+/, "");
    if (s !== n && valide(s)) return p[2] + s;
    return null;
  }
  function identifiant(v) {
    const br = String(v || "").trim();
    const dg = br.replace(/[\s.\-()]/g, "");
    /* Raccourci Bénin : seulement si « 229 » explicite ou pays sélectionné = Bénin
       (sinon collision avec les numéros ivoiriens 01/05/07 à 10 chiffres). */
    const t229 = dg.match(/^\+?229(01\d{8})$/) ||
      (paysSel && paysSel[2] === "229" ? dg.match(/^(01\d{8})$/) : null);
    if (t229) return { email: "t229" + t229[1] + "@tel.pronos-foot.bj", tel: "229" + t229[1], ok: true };
    if (/^\+?\d{6,}$/.test(dg)) {
      let p = paysSel;
      if (dg.startsWith("+")) { const q = paysParCc(dg.replace(/\D/g, "")); if (q) p = q; }
      const t = normTelPays(p, dg);
      if (t) return { email: "t" + t + "@tel.pronos-foot.bj", tel: t, ok: true };
      return { email: "", tel: null, ok: false,
        msg: "Numéro " + p[1] + " (+" + p[2] + ") attendu : " +
          (p[3] === p[4] ? p[3] + " chiffres" : p[3] + " à " + p[4] + " chiffres") +
          (p[2] === "229" ? " (ex. 01 97 48 29 46)" : "") + "." };
    }
    const e = br.toLowerCase();
    return { email: e, tel: null, ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) };
  }
  /* Sélecteur de pays (feuille modale avec recherche). */
  function ouvreSelecteurPays(cb) {
    if (document.getElementById("v-pays-modal")) return;
    const ov = document.createElement("div");
    ov.id = "v-pays-modal";
    ov.className = "fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center";
    ov.innerHTML = `<div class="w-full sm:max-w-sm bg-surface-container-high rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col p-3 gap-2 shadow-2xl">
        <div class="font-label-micro text-label-micro uppercase tracking-widest text-outline px-1">Choisir le pays (indicatif)</div>
        <input id="v-pays-q" type="text" placeholder="Rechercher un pays ou un indicatif…" autocomplete="off"
          class="w-full bg-surface-container-lowest rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface outline-none">
        <div id="v-pays-liste" class="overflow-y-auto flex flex-col gap-0.5"></div></div>`;
    document.body.appendChild(ov);
    const liste = ov.querySelector("#v-pays-liste");
    const q = ov.querySelector("#v-pays-q");
    const ferme = () => ov.remove();
    const dessine = (filtre) => {
      const f = (filtre || "").trim().toLowerCase();
      const fd = f.replace(/\D/g, "");
      liste.innerHTML = "";
      PAYS_AFRIQUE
        .filter((p) => !f || p[1].toLowerCase().includes(f) || (fd && p[2].startsWith(fd)))
        .forEach((p) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-surface-container-lowest" +
            (p === paysSel ? " bg-surface-container-lowest" : "");
          b.innerHTML = `<span class="text-xl leading-none">${p[0]}</span>
            <span class="flex-1 font-body-sm text-body-sm text-on-surface truncate">${p[1]}</span>
            <span class="font-metric-sm text-metric-sm text-primary">+${p[2]}</span>`;
          b.onclick = () => { paysSel = p; ferme(); if (cb) cb(p); };
          liste.appendChild(b);
        });
    };
    ov.addEventListener("click", (e) => { if (e.target === ov) ferme(); });
    q.addEventListener("input", () => dessine(q.value));
    dessine("");
    setTimeout(() => q.focus(), 60);
  }
  /* Branche le bouton pays + le formatage du champ téléphone de la page. */
  function initPays() {
    const btn = document.getElementById("country-toggle") || document.getElementById("prefix-display");
    const maj = () => {
      if (btn) btn.innerHTML =
        `<span class="text-base leading-none">${paysSel[0]}</span>` +
        `<span class="font-metric-sm text-metric-sm text-on-surface font-semibold">+${paysSel[2]}</span>` +
        `<span class="material-symbols-outlined text-[14px] text-outline">expand_more</span>`;
      const hint = document.getElementById("phone-hint");
      if (hint) hint.textContent = paysSel[1] + " (+" + paysSel[2] + ") — numéro à " +
        (paysSel[3] === paysSel[4] ? paysSel[3] + " chiffres" : paysSel[3] + " à " + paysSel[4] + " chiffres") +
        (paysSel[2] === "229" ? " (ex. 01 97 48 29 46)" : "");
      const oi = document.getElementById("operator-indicator");
      if (oi && paysSel[2] !== "229") { oi.classList.add("hidden"); oi.classList.remove("flex"); }
    };
    if (btn) btn.onclick = (e) => { e.preventDefault(); ouvreSelecteurPays(maj); };
    maj();
    const inp = document.getElementById("phone-input") || document.getElementById("login-input");
    if (inp && !inp.dataset.paysBranch) {
      inp.dataset.paysBranch = "1";
      inp.addEventListener("input", () => {
        if (inp.type === "email" || inp.value.includes("@")) return; /* mode e-mail : ne pas formater */
        let raw = inp.value.replace(/\D/g, "");
        const max = Math.max(paysSel[3], paysSel[4]) + 1;   /* +1 : tolérance 0 initial */
        if (raw.length > max) raw = raw.slice(0, max);
        let f = "";
        for (let i = 0; i < raw.length; i++) { if (i > 0 && i % 2 === 0) f += " "; f += raw[i]; }
        if (inp.value !== f) inp.value = f;
        const oi = document.getElementById("operator-indicator");
        const ol = document.getElementById("operator-label");
        if (oi && ol) {
          if (paysSel[2] === "229" && raw.length >= 4) {
            const p2 = raw.replace(/^01/, "").substring(0, 2);
            oi.classList.remove("hidden"); oi.classList.add("flex");
            ol.textContent = ["96","97","61","62","51","52","53","54"].includes(p2) ? "MTN"
              : ["95","94","64","65"].includes(p2) ? "MOOV"
              : ["40","41","42","43","44","45"].includes(p2) ? "CELTIIS" : "GSM";
          } else { oi.classList.add("hidden"); oi.classList.remove("flex"); }
        }
      });
    }
  }
  function msgErreur(e) {
    const m = String((e && e.message) || e);
    if (/invalid login credentials/i.test(m)) return "Identifiant ou mot de passe incorrect.";
    if (/already been registered|already registered/i.test(m))
      return "Ce numéro (ou e-mail) a déjà un compte — passe par la page Connexion.";
    if (/password should be at least/i.test(m)) return "Mot de passe trop court : 6 caractères minimum.";
    if (/email rate limit|over_email_send_rate_limit/i.test(m))
      return "Inscriptions momentanément bloquées : le serveur a dépassé sa limite d'envoi d'e-mails de confirmation. Réessaie dans 1 heure (ou préviens l'administrateur sur WhatsApp).";
    return m;
  }
  function pageAuth(mode) {
    const onglets = document.getElementById("tab-email") && document.getElementById("panel-email");
    let email = null;
    let lireIdf = null;
    if (onglets) {
      /* Formulaire d'inscription v2 : onglets E-mail / Téléphone + pays. */
      let actif = "tel";
      const tabE = document.getElementById("tab-email");
      const tabT = document.getElementById("tab-phone");
      const panE = document.getElementById("panel-email");
      const panT = document.getElementById("panel-phone");
      const emailIn = document.getElementById("email-input");
      const phoneIn = document.getElementById("phone-input");
      const CLS_ON = "py-2 text-center rounded font-headline-sm text-metric-sm bg-surface-container-high text-primary shadow-xs transition-all";
      const CLS_OFF = "py-2 text-center rounded font-headline-sm text-metric-sm text-on-surface-variant hover:text-on-surface transition-all";
      const majOnglets = () => {
        tabE.className = actif === "email" ? CLS_ON : CLS_OFF;
        tabT.className = actif === "tel" ? CLS_ON : CLS_OFF;
        panE.style.display = actif === "email" ? "flex" : "none";
        panT.style.display = actif === "tel" ? "flex" : "none";
      };
      tabE.onclick = () => { actif = "email"; majOnglets(); if (emailIn) emailIn.focus(); };
      tabT.onclick = () => { actif = "tel"; majOnglets(); if (phoneIn) phoneIn.focus(); };
      majOnglets();
      initPays();
      email = phoneIn || emailIn;
      lireIdf = () => identifiant(actif === "email" ? (emailIn || {}).value : (phoneIn || {}).value);
    } else {
      email = document.querySelector("main input[type=email]") ||
        document.querySelector("main input[type=tel], main input[inputmode=tel], main input[inputmode=numeric]");
      if (email) {
        email.type = "text";
        email.inputMode = "email";
        email.placeholder = "e-mail ou numéro de téléphone";
        email.removeAttribute("maxlength");
        email.autocomplete = "username";
        const lab = feuilleParTexte("ADRESSE E-MAIL") || feuilleParTexte("CANAL NUMÉRIQUE") ||
          feuilleParTexte("NUMÉRO TERMINAL GSM") || feuilleParTexte("E-MAIL");
        if (lab) lab.textContent = "E-MAIL OU NUMÉRO";
        const aide = feuilleParTexte("OTP SMS : bientôt");
        if (aide) aide.textContent = "Pas de code SMS : ton numéro + ton mot de passe suffisent.";
      }
      initPays();   /* page connexion : bouton pays sur le préfixe */
    }
    const mdp = document.querySelector("main input[type=password]");
    const bouton = [...document.querySelectorAll("main button, main a")]
      .find((b) => /Déverrouiller|Recevoir le code|Créer mon compte/i.test(b.textContent || ""));
    const msg = document.createElement("div");
    msg.className = "mt-gutter-sm font-body-sm text-body-sm text-primary px-gutter-base";
    if (bouton) bouton.parentElement.appendChild(msg);
    /* Code promo (parrainage vendeur) : case à cocher + champ. */
    let promoWrap = null;
    if (bouton) {
      promoWrap = document.createElement("div");
      promoWrap.className = "mt-gutter-base px-gutter-base flex flex-col gap-gutter-sm";
      promoWrap.innerHTML = `<label class="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant" style="cursor:pointer">
          <input id="v-promo-ok" type="checkbox"> J'ai un code promo</label>
        <input id="v-promo" type="text" placeholder="ex. PF-7K9QM" autocomplete="off"
          autocapitalize="characters" style="display:none"
          class="w-full bg-surface-container-low rounded-lg px-gutter-base py-2.5 font-metric-xs text-metric-xs text-on-surface outline-none">
        <div id="v-promo-msg" class="font-body-xs text-body-xs text-on-surface-variant"></div>`;
      bouton.parentElement.insertBefore(promoWrap, bouton);
      const pOk = promoWrap.querySelector("#v-promo-ok");
      const pIn = promoWrap.querySelector("#v-promo");
      pOk.onchange = () => {
        pIn.style.display = pOk.checked ? "block" : "none";
        if (pOk.checked) pIn.focus();
      };
      /* Lien d'affilié : ?p=PF-XXXXX (ou ?code=PF-XXXXX) pré-remplit le code
         promo — l'espace affilié génère des liens de ce format. */
      try {
        const prm = new URLSearchParams(location.search);
        const cpUrl = (prm.get("p") || prm.get("code") || "").trim().toUpperCase();
        if (/^PF-[A-Z0-9]{5}$/.test(cpUrl)) {
          pOk.checked = true;
          pIn.style.display = "block";
          pIn.value = cpUrl;
        }
      } catch (e) { /* navigateur trop ancien : le champ manuel reste là */ }
    }
    const codePromo = () => {
      if (!promoWrap || !promoWrap.querySelector("#v-promo-ok").checked) return "";
      return (promoWrap.querySelector("#v-promo").value || "").trim().toUpperCase();
    };
    async function declarerPromo() {
      const code = codePromo();
      const mm = promoWrap && promoWrap.querySelector("#v-promo-msg");
      if (!code) return null;
      try {
        const r = await SB.rpc("declarer_code_promo", { p_code: code });
        const st = r.data;
        if (mm) mm.textContent = st === "ok" ? "Code promo enregistré ✓ — ton parrain sera crédité."
          : st === "deja" ? "Ton compte a déjà un code promo enregistré."
          : st === "invalide" ? "Code promo inconnu ou désactivé — non enregistré."
          : "Code non enregistré pour l'instant — tu pourrais le ressaisir sur la page d'activation.";
        return st;
      } catch (e) {
        if (mm) mm.textContent = "Code promo non enregistré pour l'instant — ressaisis-le sur la page d'activation.";
        return null;
      }
    }
    const google = [...document.querySelectorAll("main button")]
      .find((b) => /Google/i.test(b.textContent || ""));
    if (google) google.onclick = async () => {
      try {
        await SB.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html" } });
      } catch (e) { msg.textContent = "Google : à activer côté Supabase (Auth → Providers)."; }
    };
    const main_ = document.querySelector("main");
    if (main_ && !document.getElementById("v-legaux")) {
      const liens = document.createElement("div");
      liens.id = "v-legaux";
      liens.className = "mt-gutter-base mb-gutter-sm px-gutter-base font-body-xs text-body-xs text-center text-on-surface-variant";
      liens.innerHTML = 'En continuant, tu acceptes nos <a href="conditions.html" class="underline">conditions d\'utilisation</a> ' +
        'et notre <a href="confidentialite.html" class="underline">politique de confidentialité</a>.';
      main_.appendChild(liens);
    }
    if (mode === "connexion" && bouton) {
      const wrap = document.createElement("div");
      wrap.className = "mt-gutter-base flex flex-col gap-gutter-sm px-gutter-base";
      wrap.innerHTML = `<div class="font-label-micro text-label-micro uppercase tracking-widest text-outline">Code opérateur</div>
        <input id="v-code" type="password" placeholder="••••••••" autocomplete="off"
          class="w-full bg-surface-container-low rounded-lg px-gutter-base py-2.5 font-metric-xs text-metric-xs text-on-surface outline-none">
        <button id="v-code-btn" class="bg-surface-container-high text-on-surface rounded-lg py-2.5 font-headline-sm text-headline-sm">Entrer avec le code</button>`;
      bouton.parentElement.appendChild(wrap);
      wrap.querySelector("#v-code-btn").onclick = async () => {
        msg.textContent = "…";
        try {
          const r = await SB.auth.signInWithPassword({
            email: CFG.OPERATEUR_EMAIL,
            password: wrap.querySelector("#v-code").value });
          if (r.error) throw r.error;
          msg.textContent = "Accès opérateur ouvert.";
          setTimeout(() => location.href = "selections.html", 600);
        } catch (e) { msg.textContent = "Code refusé."; }
      };
    }
    if (!bouton || !email || !mdp) {
      msg.textContent = "Formulaire incomplet — signale-le, je corrige.";
      return;
    }
    bouton.onclick = async (e) => {
      e.preventDefault();
      msg.textContent = "…";
      const coche = document.getElementById("terms-checkbox") ||
        document.querySelector("main input[type=checkbox]:not(#v-promo-ok)");
      if (mode === "inscription" && coche && !coche.checked) {
        msg.textContent = "Coche la certification (18 ans + conditions) d'abord.";
        return;
      }
      const idf = lireIdf ? lireIdf() : identifiant(email.value);
      if (!idf.ok) {
        msg.textContent = idf.msg || "Identifiant invalide : adresse e-mail ou numéro de téléphone attendu.";
        return;
      }
      try {
        if (mode === "connexion") {
          const r = await SB.auth.signInWithPassword({ email: idf.email, password: mdp.value });
          if (r.error) throw r.error;
          await declarerPromo();
          const fmtTel = (t) => {
            const p = paysParCc(t);
            const cc = p ? p[2] : "";
            const d = cc ? t.slice(cc.length) : t;
            let x = "";
            for (let i = 0; i < d.length; i++) { if (i > 0 && i % 2 === 0) x += " "; x += d[i]; }
            return "+" + cc + (cc ? " " : "") + x;
          };
          msg.textContent = idf.tel ? "Connecté avec le " + fmtTel(idf.tel) + "."
            : "Connecté — retour à l'accueil.";
          setTimeout(() => location.href = "index.html", 900);
        } else {
          const r = await SB.auth.signUp({
            email: idf.email, password: mdp.value,
            options: { data: { phone: idf.tel || null } },
          });
          if (r.error) throw r.error;
          if (r.data.session) {
            await declarerPromo();
            msg.textContent = "Compte créé — dernière étape : l'activation.";
            const cp = codePromo();
            setTimeout(() => location.href =
              "activation.html" + (cp ? "?code=" + encodeURIComponent(cp) : ""), 1100);
          } else if (idf.tel) {
            msg.textContent = "Compte créé, mais la confirmation e-mail est encore active côté serveur — " +
              "avec un numéro de téléphone tu ne pourras pas la recevoir. Réglage à faire : " +
              "Supabase → Authentication → Providers → Email → désactiver « Confirm email ».";
          } else {
            msg.textContent = "Compte créé : confirme ton e-mail puis connecte-toi.";
          }
        }
      } catch (err) { msg.textContent = msgErreur(err); }
    };
  }

  function etatSession() {
    const btn = document.getElementById("v-compte");
    if (!btn || !SB) return;
    let menu = document.getElementById("v-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "v-menu";
      menu.className = "card hi";
      menu.style.cssText = "display:none;position:fixed;z-index:60;right:12px;top:66px;width:250px;flex-direction:column;gap:4px";
      document.body.appendChild(menu);
      document.addEventListener("click", (e) => {
        if (menu.style.display !== "none" && !menu.contains(e.target) && !btn.contains(e.target))
          menu.style.display = "none";
      });
    }
    const afficheId = (email) => {
      const m = /^t(\d{7,16})@tel\.pronos-foot\.bj$/.exec(email || "");
      if (!m) return email || "";
      const n = m[1];
      const p = paysParCc(n);
      const cc = p ? p[2] : "";
      const d = cc ? n.slice(cc.length) : n;
      let s = "";
      for (let i = 0; i < d.length; i++) { if (i > 0 && i % 2 === 0) s += " "; s += d[i]; }
      return (cc ? "+" + cc + " " : "+") + s;
    };
    const dateFin = (f) => { try {
      return new Date(f + "T12:00:00Z").toLocaleDateString("fr-FR",
        { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return f; } };
    async function majBouton() {
      const { data } = await SB.auth.getSession();
      const sess = data && data.session;
      if (!sess) {
        btn.style.outline = "";
        btn.title = "Connexion";
        btn.onclick = () => location.href = "connexion.html";
        menu.style.display = "none";
        return;
      }
      btn.style.outline = "2px solid #4ae176";
      btn.title = "Mon compte";
      const u = sess.user;
      let abo = null;
      try {
        const r = await SB.from("abonnements").select("fin,plan").eq("user_id", u.id)
          .gte("fin", aujourdHui()).limit(1);
        abo = (r.data || [])[0] || null;
      } catch (e) {}
      menu.innerHTML = `
        <div style="padding:4px 2px">
          <div class="lbl">Mon compte</div>
          <div class="small" style="word-break:break-all">${esc(afficheId(u.email))}</div>
        </div>
        <div style="padding:4px 2px">
          <div class="lbl">Mon abonnement</div>
          <div class="small ${abo ? "em" : "rd"}">${
            abo ? "Actif jusqu'au " + esc(dateFin(abo.fin)) : "Inactif"}</div>
        </div>
        ${abo ? "" : `<a href="activation.html" class="btn em" style="padding:9px">Activer via WhatsApp</a>`}
        <button id="v-out" class="btn ghost rd" style="padding:9px">Se déconnecter</button>`;
      const out = menu.querySelector("#v-out");
      if (out) out.onclick = async () => { await SB.auth.signOut(); location.reload(); };
      btn.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === "none" ? "flex" : "none";
      };
    }
    try {
      SB.auth.onAuthStateChange((ev) => {
        if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") majBouton();
      });
    } catch (e) {}
    majBouton();
  }

  /* ---------------------------------------------------------- démarrage */
  (async function () {
    coquille();
    if (PAGE === "paiement") {
      const b = document.createElement("div");
      b.className = "warn";
      b.innerHTML = "<b>PHASE 4 — PAIEMENTS NON ACTIFS.</b> Écran de prévisualisation design " +
        "uniquement : aucun encaissement avant validation du cadre légal. Rien ne peut être débité ici.";
      const m = document.querySelector("main");
      if (m) m.prepend(b);
      document.querySelectorAll("button, a").forEach((x) => {
        if (/payer/i.test(x.textContent || "")) { x.disabled = true; x.style.opacity = ".4"; }
      });
      appliquerPrixPaiement();   /* prix/promo dynamiques (table parametres) */
    }
    const besoinAuth = ["connexion", "inscription"].includes(PAGE);
    const besoinData = ["accueil", "selections", "corners", "bilan"].includes(PAGE);
    if (CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY !== "A_COLLER") {
      SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    if (besoinAuth) {
      if (!SB) banniere("Connexion indisponible : clé publique Supabase absente de assets/config.js.");
      else pageAuth(PAGE);
    }
    if (besoinAuth || besoinData) await sessionPret();
    if (PAGE === "series") { pageSeries(); etatSession(); return; }
    if (besoinData) {
      const D = await charge();
      window.__ACC = await accesOk();
      if (!window.__ACC.ok && window.__ACC.raison === "sans-abonnement" &&
          (PAGE === "selections" || PAGE === "corners")) {
        location.replace("activation.html");
        return;
      }
      if (D) {
        if (PAGE === "accueil") pageAccueil(D);
        if (PAGE === "selections") (window.__ACC.ok ? pageSelections(D) : verrou("selections"));
        if (PAGE === "corners") (window.__ACC.ok ? pageCorners(D) : verrou("corners"));
        if (PAGE === "bilan") pageBilan(D);
        setTimeout(demarrerLive, 4000);
      } else if (!window.__ACC.ok && (PAGE === "selections" || PAGE === "corners")) {
        verrou(PAGE);
      }
    }
    etatSession();
  })();
})();
