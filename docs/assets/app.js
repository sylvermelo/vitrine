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
    const b = document.createElement("div");
    b.className = "mx-gutter-base mt-gutter-base rounded-xl p-gutter-base " +
      "bg-error-container/30 border border-error-container text-on-error-container " +
      "font-body-sm text-body-sm";
    b.textContent = msg;
    const main = document.querySelector("main");
    if (main) main.prepend(b);
  }

  /* Au retour d'une connexion Google, la session met un instant à
     s'installer (jeton dans l'URL). Attendre la fin de la détection avant
     de décider « pas connecté » — sinon la page redemande de se connecter
     juste après un retour réussi. */
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
    const txt = raison === "sans-abonnement"
      ? "Ton compte est connecté mais aucun abonnement actif n'y est rattaché."
      : "Les conseils du jour — sélections, combinés, coupon corners — sont réservés aux abonnés.";
    return `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-gutter-sm shadow-sm">
      <div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary">lock</span>
      <span class="font-label-micro text-label-micro uppercase tracking-widest text-primary">Zone abonnés</span></div>
      <div class="font-headline-md text-headline-md text-on-surface">Conseils réservés aux abonnés</div>
      <div class="font-body-sm text-body-sm text-on-surface-variant">${txt}
      L'historique et le bilan restent publics, pour la confiance. 30 jours d'accès, sans engagement.</div>
      <div class="flex gap-2">${raison === "sans-abonnement"
        ? `<a href="activation.html" class="flex-1 text-center bg-primary text-on-primary py-2.5 rounded-lg font-headline-sm text-headline-sm">Activer mon compte</a>`
        : `<a href="connexion.html" class="flex-1 text-center bg-primary text-on-primary py-2.5 rounded-lg font-headline-sm text-headline-sm">Se connecter</a>`}
      <a href="acces.html" class="flex-1 text-center bg-surface-container-high text-on-surface py-2.5 rounded-lg font-headline-sm text-headline-sm">Voir l'accès</a></div></div>`;
  }

  function verrou(page) {
    const raison = (window.__ACC || {}).raison || "anon";
    if (page === "selections") {
      const z1 = zone("z-list", "Liverpool", CARTE);
      if (z1) z1.innerHTML = carteVerrou(raison);
      const z2 = zone("z-comb", "SAFE DU JOUR", CARTE);
      if (z2) z2.innerHTML = "";
      const t = document.getElementById("v-tabs"); if (t) t.style.display = "none";
      const ch = document.getElementById("z-chips"); if (ch) ch.style.display = "none";
    } else {
      const z = zone("z-legs", "Aston Villa vs Wolves", CARTE);
      if (z) { z.className = "flex flex-col gap-gutter-sm"; z.innerHTML = carteVerrou(raison); }
      setTexte("c-cote", "—"); setTexte("c-proba", "—");
      majTexte("1.85", "—", true); majTexte("54 %", "—", true);
    }
  }

  /* ---------------------------------------------------------- gabarits */
  const PILL = "px-2 py-1 bg-surface-container-highest text-primary font-metric-xs " +
    "text-metric-xs tracking-wider uppercase whitespace-nowrap";
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

  function ligneSelection(s) {
    const verdict = s.touche == null ? "" :
      `<span class="${s.touche ? "text-secondary" : "text-error"} font-metric-xs text-metric-xs">` +
      `${s.touche ? "✓ TOUCHÉE" : "✗ MANQUÉE"} ${s.buts_home ?? ""}-${s.buts_away ?? ""}</span>`;
    return `<div class="p-gutter-base hover:bg-surface-container-high/40 transition-colors flex flex-col space-y-gutter-xs">
      <div class="flex items-center justify-between gap-2">
        <span class="font-label-micro text-label-micro uppercase tracking-widest text-outline">${esc((s.ligue || s.div || "").toUpperCase())} · ${esc(s.jour)}${s.heure ? " · " + esc(s.heure) : ""}</span>
        <span class="${PILL}">${esc(s.option)}</span>
      </div>
      <div class="flex items-end justify-between gap-2">
        <div class="min-w-0">
          <div class="font-headline-md text-headline-md text-on-surface truncate">${esc(s.home)} vs ${esc(s.away)}</div>
          <div class="font-body-xs text-body-xs text-on-surface-variant">${verdict || (s.confiance ? "confiance " + esc(s.confiance) : "&nbsp;")}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-metric-md text-metric-md text-secondary">${pct(s.p)}</div>
          <div class="font-metric-xs text-metric-xs text-on-surface-variant">cote juste ${f2(s.cote_juste)}</div>
        </div>
      </div>
    </div>`;
  }

  function carteCombine(c) {
    const jambesToutes = c.jambes || [];
    const resolues = jambesToutes.filter((l) => l.resultat && l.resultat.touche != null);
    const perdues = resolues.filter((l) => !l.resultat.touche).length;
    const etat = c.touche != null
      ? (c.touche
        ? `<span class="px-2 py-1 bg-secondary-container/30 text-secondary font-metric-xs text-metric-xs uppercase">✓ validé</span>`
        : `<span class="px-2 py-1 bg-error-container/30 text-error font-metric-xs text-metric-xs uppercase">✗ perdu</span>`)
      : perdues
        ? `<span class="px-2 py-1 bg-error-container/30 text-error font-metric-xs text-metric-xs uppercase">✗ perdu (${resolues.length}/${jambesToutes.length} jouées)</span>`
        : resolues.length
          ? `<span class="${PILL}">EN COURS ${resolues.length}/${jambesToutes.length}</span>`
          : `<span class="${PILL}">EN ATTENTE</span>`;
    const jambes = jambesToutes.slice(0, 10).map((l) => {
      const r = l.resultat || {};
      const verdict = r.touche == null ? "" :
        ` <span class="${r.touche ? "text-secondary" : "text-error"} font-bold">${r.touche ? "✓" : "✗"} ${r.buts_home ?? ""}-${r.buts_away ?? ""}</span>`;
      return `<div class="flex justify-between gap-2 font-metric-xs text-metric-xs text-on-surface-variant">
         <span class="truncate">· ${esc(l.home)} vs ${esc(l.away)} — ${esc(l.option)}${verdict}</span>
         <span class="shrink-0">${l.p ? pct(l.p) : ""}</span></div>`;
    }).join("");
    const origine = (c.brut && c.brut.origine)
      ? `<div class="font-body-xs text-body-xs text-error border border-error-container/40 rounded-lg p-2">${esc(c.brut.origine)}</div>` : "";
    return `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-gutter-sm shadow-sm">
      <div class="flex items-center justify-between">
        <span class="font-label-micro text-label-micro uppercase tracking-widest text-primary">${esc(nomBeau(c.nom))}</span>
        ${etat}
      </div>
      ${origine}
      <div class="flex items-end justify-between">
        <div><div class="font-metric-display text-metric-display text-on-surface leading-none">${f2(c.cote)}</div>
        <div class="font-metric-xs text-metric-xs text-on-surface-variant">cote totale</div></div>
        <div class="text-right"><div class="font-metric-md text-metric-md text-primary">${pct(c.p_combine)}</div>
        <div class="font-metric-xs text-metric-xs text-on-surface-variant">proba combinée</div></div>
      </div>
      <div class="flex flex-col gap-1">${jambes}</div>
    </div>`;
  }

  /* ---------------------------------------------------------- données */
  async function charge() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY === "A_COLLER") {
      banniere("Vitrine non connectée : clé publique Supabase absente de assets/config.js.");
      return null;
    }
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
      banniere("Lecture Supabase refusée ou injoignable : colle les politiques RLS " +
        "(supabase/rls_vitrine.sql du repo robot) dans le SQL Editor, puis recharge.");
      return null;
    }
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
    const selHier = D.sel.filter((s) => s.jour === h && s.touche != null);
    const tHier = selHier.filter((s) => s.touche).length;
    /* « SAFE » = le SAFE DU JOUR uniquement (nom exact). Le SAFE WEEK-END et
       le SAFE 2 sont des produits distincts : les mélanger fausse les
       compteurs (bug du 06/09 : week-end manqué affiché à la place du jour). */
    const safes = D.comb.filter((c) => c.nom === "safe" && c.touche != null);
    const tSafe = safes.filter((c) => c.touche).length;
    const safeHier = D.comb.find((c) => c.jour === h && c.nom === "safe");
    const safe2Hier = D.comb.find((c) => c.jour === h && c.nom === "safe_2");

    let blocSafe;
    if (safeHier) {
      const v = safeHier.touche == null
        ? `<span class="${PILL}">EN ATTENTE</span>`
        : safeHier.touche
          ? `<span class="px-2 py-1 bg-secondary-container/30 text-secondary font-metric-xs text-metric-xs uppercase">✓ passé</span>`
          : `<span class="px-2 py-1 bg-error-container/30 text-error font-metric-xs text-metric-xs uppercase">✗ manqué</span>`;
      const jambes = (safeHier.jambes || []).slice(0, 4).map((l) => {
        const r = l.resultat || {};
        const etat = r.touche == null ? "" :
          ` <span class="${r.touche ? "text-secondary" : "text-error"}">${r.touche ? "✓" : "✗"} ${r.buts_home ?? ""}-${r.buts_away ?? ""}</span>`;
        return `<div class="flex justify-between gap-2 font-metric-xs text-metric-xs text-on-surface-variant">
          <span class="truncate">· ${esc(l.home)} vs ${esc(l.away)} — ${esc(l.option)}${etat}</span>
          <span class="shrink-0">${l.p ? pct(l.p) : ""}</span></div>`;
      }).join("");
      const l2 = safe2Hier
        ? `<div class="font-body-xs text-body-xs ${safe2Hier.touche == null ? "text-on-surface-variant" : safe2Hier.touche ? "text-secondary" : "text-error"}">SAFE 2 · rattrapage : ${safe2Hier.touche == null ? "en cours" : safe2Hier.touche ? "✓ passé" : "✗ manqué"}</div>`
        : "";
      blocSafe = `<div class="flex items-center justify-between gap-2">
          <span class="font-headline-md text-headline-md text-on-surface">SAFE du ${esc(dateFr(h))}</span>${v}</div>
        <div class="flex flex-col gap-1">${jambes}</div>${l2}`;
    } else {
      blocSafe = `<div class="font-headline-md text-headline-md text-on-surface">Pas de SAFE hier</div>
        <div class="font-body-xs text-body-xs text-on-surface-variant">Le robot s'abstient quand la qualité n'y est pas — c'est aussi ça, la discipline.</div>`;
    }

    const compteur = (gros, petit, sous, couleur) => `<div class="bg-surface-container p-gutter-sm rounded-lg flex flex-col">
      <span class="font-metric-display text-metric-lg ${couleur || "text-primary"} leading-none">${gros}</span>
      <span class="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider mt-gutter-xs">${petit}</span>
      <span class="font-metric-xs text-metric-xs text-on-surface-variant">${sous}</span></div>`;

    const pcHier = selHier.length ? Math.round(100 * tHier / selHier.length) + " %" : "—";
    const pcSafe = safes.length ? Math.round(100 * tSafe / safes.length) + " % de réussite" : "archive vide";
    /* COTE 2 / COTE 5 : uniquement la veille */
    const etatComb = (c) => {
      if (!c) return { gros: "—", sous: "pas publié hier", couleur: "text-outline" };
      const legs = c.jambes || [];
      const res = legs.filter((l) => l.resultat && l.resultat.touche != null);
      const perdu = c.touche === false || res.some((l) => !l.resultat.touche);
      if (perdu) return { gros: "✗", sous: "manqué hier", couleur: "text-error" };
      if (c.touche === true) return { gros: "✓", sous: `passé (${legs.length} jambes)`, couleur: "text-secondary" };
      if (res.length) return { gros: `${res.length}/${legs.length}`, sous: "en cours", couleur: "text-primary" };
      return { gros: "—", sous: "en attente", couleur: "text-outline" };
    };
    const e2 = etatComb(D.comb.find((c) => c.nom === "cote2" && c.jour === h));
    const e5 = etatComb(D.comb.find((c) => c.nom === "cote5" && c.jour === h));
    return `<div id="z-veille" class="mx-gutter-base mt-gutter-sm rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-gutter-sm shadow-sm">
      <span class="font-label-micro text-label-micro uppercase tracking-widest text-primary">Résultats d'hier · ${esc(h)}</span>
      ${blocSafe}
      <div class="grid grid-cols-2 gap-gutter-sm">
        ${compteur(selHier.length ? `${tHier}/${selHier.length}` : "—", "Conseils touchés hier", pcHier, "text-primary")}
        ${compteur(e2.gros, "Cote 2 hier", e2.sous, e2.couleur)}
        ${compteur(safes.length ? `${tSafe}/${safes.length}` : "—", "SAFE passés depuis le lancement", pcSafe, "text-primary")}
        ${compteur(e5.gros, "Cote 5 hier", e5.sous, e5.couleur)}
      </div></div>`;
  }

  function pageAccueil(D) {
    const auj = aujourdHui();
    let sels = D.sel.filter((s) => s.jour === auj);
    let jour = auj;
    if (!sels.length) {
      const futur = [...new Set(D.sel.map((s) => s.jour))].filter((j) => j >= auj).sort();
      jour = futur[0] || (D.sel[0] ? D.sel[0].jour : auj);
      sels = D.sel.filter((s) => s.jour === jour);
    }
    sels = sels.sort((a, b) => (b.p || 0) - (a.p || 0)).slice(0, 3);
    const accOk = (window.__ACC || {}).ok;
    const z = zone("z-sel", null, null);
    if (z) {
      z.className = "divide-y divide-surface-container-low flex flex-col";
      z.innerHTML = sels.length && accOk ? sels.map(ligneSelection).join("") : carteVerrou((window.__ACC || {}).raison || "anon");
    }
    const resolues = D.sel.filter((s) => s.touche != null);
    const touches = resolues.filter((s) => s.touche).length;
    if (resolues.length) {
      const t = Math.round(100 * touches / resolues.length) + " %";
      if (!setTexte("a-hit", t)) majTexte("78 %", t, true);
    }
    /* carte « HIER » : insérée sous la grille des 3 stats */
    const vieille = document.getElementById("z-veille");
    if (vieille) vieille.remove();
    const ancre = document.getElementById("a-hit");
    const grille = ancre && ancre.closest(".grid");
    const carte = document.createElement("div");
    carte.innerHTML = carteVeille(D);
    const noeud = carte.firstElementChild;
    if (grille && grille.parentElement) grille.insertAdjacentElement("afterend", noeud);
    else { const m = document.querySelector("main"); if (m) m.prepend(noeud); }
    majTexte("Source ESPN", `source ESPN · ${touches}/${resolues.length} vérifiées`);
  }

  function pageSelections(D) {
    const auj = aujourdHui();
    const jours = [...new Set(D.sel.map((s) => s.jour).concat(D.comb.map((c) => c.jour)))]
      .filter(Boolean).sort().reverse();
    let jour = jours.find((j) => j >= auj) || jours[0] || auj;
    let onglet = "conseils";
    const zListe = zone("z-list", "Liverpool", CARTE);
    const zComb = zone("z-comb", "SAFE DU JOUR", CARTE);
    const zChips = document.getElementById("z-chips");
    const tabs = [...document.querySelectorAll("#v-tabs [data-tab]")];
    const TAB_ACT = "filter-tab py-1.5 rounded text-center font-label-micro text-label-micro " +
      "uppercase tracking-wider transition-all bg-surface-container-highest text-primary font-bold shadow-sm";
    const TAB_INA = "filter-tab py-1.5 rounded text-center font-label-micro text-label-micro " +
      "uppercase tracking-wider transition-all text-outline hover:text-on-surface font-semibold";
    const combsJour = (filtre) => D.comb.filter((c) => c.jour === jour &&
      c.nom !== "corners_montante" && filtre(c));
    const carteVide = (txt) => `<div class="rounded-xl bg-surface-container-low p-gutter-base ` +
      `font-body-sm text-body-sm text-on-surface-variant">${txt}</div>`;
    function rend() {
      tabs.forEach((b) => { b.className = b.dataset.tab === onglet ? TAB_ACT : TAB_INA; });
      const n = {
        conseils: D.sel.filter((s) => s.jour === jour).length,
        safe: combsJour((c) => /safe/.test((c.nom || "").toLowerCase())).length,
        cote2: combsJour((c) => c.nom === "cote2").length,
        cote5: combsJour((c) => c.nom === "cote5").length,
      };
      const LIB = { conseils: "Conseils", safe: "SAFE", cote2: "Cote 2", cote5: "Cote 5" };
      tabs.forEach((b) => {
        const k = b.dataset.tab;
        b.textContent = n[k] ? `${LIB[k]} (${n[k]})` : LIB[k];
      });
      if (zListe) zListe.innerHTML = "";
      if (zComb) zComb.innerHTML = "";
      if (onglet === "conseils") {
        const sels = D.sel.filter((s) => s.jour === jour).sort((a, b) => (b.p || 0) - (a.p || 0));
        if (zListe) zListe.innerHTML = sels.length
          ? `<div class="divide-y divide-surface-container-low flex flex-col rounded-xl overflow-hidden bg-surface-container-low">${sels.map(ligneSelection).join("")}</div>`
          : carteVide("Aucune sélection ce jour-là — le robot s'abstient quand la qualité n'y est pas.");
      } else {
        const filtre = onglet === "safe"
          ? (c) => /safe/.test((c.nom || "").toLowerCase())
          : (c) => c.nom === onglet;
        const cs = combsJour(filtre).sort((a, b) => (b.p_combine || 0) - (a.p_combine || 0));
        if (zComb) zComb.innerHTML = cs.length
          ? cs.map(carteCombine).join("")
          : carteVide(onglet === "safe"
            ? `Aucun SAFE le ${jour} — le robot s'abstient quand la qualité n'y est pas.`
            : `Aucun combiné « ${LIB[onglet]} » le ${jour}.`);
      }
      if (zChips) {
        zChips.innerHTML = jours.slice(0, 14).map((j) =>
          `<button data-j="${j}" class="px-3 py-1.5 rounded-lg font-metric-xs text-metric-xs whitespace-nowrap ${j === jour ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}">${j === auj ? "AUJOURD'HUI" : j.slice(5)}</button>`).join("");
        zChips.querySelectorAll("button").forEach((b) =>
          b.onclick = () => { jour = b.dataset.j; rend(); });
      }
    }
    tabs.forEach((b) => b.onclick = () => { onglet = b.dataset.tab; rend(); });
    rend();
  }

  function pageCorners(D) {
    const cp = D.comb.filter((c) => c.nom === "corners_montante")
      .sort((a, b) => (b.jour || "").localeCompare(a.jour || ""))[0];
    const z = zone("z-legs", "Aston Villa vs Wolves", CARTE);
    if (!cp) {
      setTexte("c-cote", "—"); setTexte("c-proba", "—");
      if (z) z.innerHTML = `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-2">
        <div class="font-headline-md text-headline-md text-on-surface">AUCUN COUPON CE JOUR</div>
        <div class="font-body-sm text-body-sm text-on-surface-variant">Aucun match n'atteint 85 % de fréquence
        réelle mesurée sur son meilleur handicap corners. Mieux vaut sauter un jour que forcer —
        discipline algorithmique absolue.</div></div>`;
      return;
    }
    if (!setTexte("c-cote", f2(cp.cote))) majTexte("1.85", f2(cp.cote), true);
    if (!setTexte("c-proba", pct(cp.p_combine))) majTexte("54 %", pct(cp.p_combine), true);
    const titre = feuilleParTexte("COUPON MONTANTE");
    if (titre && cp.jour) titre.textContent = "COUPON MONTANTE — " + cp.jour;
    if (z) {
      z.className = "flex flex-col gap-gutter-sm";
      let mise = 1;
      const jambes = (cp.jambes || []).map((l, i) => {
        const c = l.cote || (l.p_cal ? 1 / l.p_cal : null);
        const apres = c ? mise * c : null;
        const html = `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-gutter-sm shadow-sm">
          <div class="flex items-center justify-between">
            <span class="font-metric-md text-metric-md text-primary">${String(i + 1).padStart(2, "0")}
              <span class="font-metric-xs text-metric-xs text-on-surface-variant">${esc(l.heure || "")}</span></span>
            <span class="font-label-micro text-label-micro uppercase tracking-widest text-outline">${esc(String(l.ligue || "").slice(0, 12))}</span>
          </div>
          <div class="font-headline-md text-headline-md text-on-surface">${esc(l.home)} vs ${esc(l.away)}</div>
          <span class="${PILL} self-start">${esc(l.option)}</span>
          <div class="flex items-center justify-between font-metric-xs text-metric-xs">
            <span class="text-on-surface-variant">annonce <s>${pct(l.p_brut)}</s> → <span class="text-secondary">${pct(l.p_cal)}</span></span>
            <span class="text-on-surface-variant">cote juste ${f2(c)}</span>
          </div>
          <div class="font-metric-xs text-metric-xs text-on-surface-variant">mise ${f2(mise)} u → <span class="text-on-surface">${f2(apres)} u</span></div>
        </div>`;
        if (c) mise = apres;
        return html;
      }).join("");
      z.innerHTML = jambes +
        `<div class="rounded-xl bg-surface-container-low p-gutter-base font-metric-md text-metric-md text-secondary">Si tout passe : ${f2(mise)} u récupérées</div>`;
    }
  }

  function pageBilan(D) {
    const resolues = D.sel.filter((s) => s.touche != null);
    const touches = resolues.filter((s) => s.touche).length;
    if (resolues.length) {
      const t = Math.round(100 * touches / resolues.length) + " %";
      if (!setTexte("b-hit", t)) majTexte("78 %", t, true);
    }
    if (!setTexte("b-hit-cap", `sélections touchées (${touches}/${resolues.length})`))
      majTexte("sélections touchées (43/55)", `sélections touchées (${touches}/${resolues.length})`);
    let roi = 0, n = 0;
    for (const s of resolues) {
      if (s.cote_marche == null) continue;
      roi += s.touche ? s.cote_marche - 1 : -1; n++;
    }
    const roiTxt = (roi >= 0 ? "+" : "") + roi.toFixed(1) + " u";
    if (!setTexte("b-roi", roiTxt)) majTexte("+2.1 u", roiTxt, true);
    majTexte("ROI simulé sur 30 jours", `ROI simulé sur ${n} sélections cotées`);
    const parMois = {};
    for (const s of resolues) {
      const m = (s.jour || "").slice(0, 7);
      (parMois[m] = parMois[m] || { t: 0, n: 0 });
      parMois[m].n++; if (s.touche) parMois[m].t++;
    }
    const mois = Object.keys(parMois).sort().slice(-6);
    const zMois = document.getElementById("z-mois");
    if (zMois && mois.length) {
      {
        const z = zMois;
        z.innerHTML = mois.map((m) => {
          const r = parMois[m], taux = Math.round(100 * r.t / r.n);
          const nom = new Date(m + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "short" }).toUpperCase();
          return `<div class="flex flex-col items-center justify-end gap-1 flex-1 h-full">
            <span class="font-metric-xs text-metric-xs ${taux >= 75 ? "text-on-surface-variant" : "text-tertiary"}">${taux}%</span>
            <div class="w-full rounded-t ${taux >= 75 ? "bg-primary" : "bg-tertiary"}" style="height:${Math.max(15, taux)}%"></div>
            <span class="font-label-micro text-label-micro text-on-surface-variant">${nom}</span></div>`;
        }).join("");
      }
    }
    const parMarche = {};
    for (const s of resolues) {
      const k = s.option || "?";
      (parMarche[k] = parMarche[k] || { t: 0, n: 0 });
      parMarche[k].n++; if (s.touche) parMarche[k].t++;
    }
    const top = Object.entries(parMarche).filter(([, v]) => v.n >= 4)
      .sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    const zM = zone("z-marches", "Under 2.5", /flex flex-col gap-1|flex-col/);
    if (zM && top.length) {
      zM.innerHTML = top.map(([k, v]) => {
        const taux = Math.round(100 * v.t / v.n);
        return `<div class="flex flex-col gap-1">
          <div class="flex justify-between font-body-sm text-body-sm"><span>${esc(k)}</span>
          <span class="font-metric-xs text-metric-xs ${taux >= 75 ? "text-secondary" : "text-tertiary"}">${taux} % (${v.n})</span></div>
          <div class="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${taux >= 75 ? "bg-secondary" : taux >= 65 ? "bg-primary" : "bg-tertiary"}" style="width:${taux}%"></div></div></div>`;
      }).join("");
    }
  }

  /* ---------------------------------------------------------- auth */
  /* Téléphone SANS OTP : le compte est un e-mail technique dérivé du numéro
     (t<indicatif><numéro>@tel.pronos-foot.bj, ex. t2290197482946@...).
     L'utilisateur ne voit que son numéro + son mot de passe.
     Nécessite "Confirm email" OFF côté Supabase.
     PAYS_AFRIQUE : [drapeau, nom, indicatif, min chiffres, max chiffres, préfixe?]
     (chiffres du numéro national, sans l'indicatif pays ; préfixe = motif
     RegExp optionnel que le numéro national doit respecter). */
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
      menu.className = "fixed z-[60] right-3 top-[68px] w-64 rounded-xl bg-surface-container-high " +
        "border border-outline-variant shadow-2xl p-2 flex-col gap-1";
      menu.style.display = "none";
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
        <div class="px-2 py-1.5">
          <div class="font-label-micro text-label-micro uppercase tracking-widest text-outline">Mon compte</div>
          <div class="font-body-sm text-body-sm text-on-surface break-all">${esc(afficheId(u.email))}</div>
        </div>
        <div class="px-2 py-1.5">
          <div class="font-label-micro text-label-micro uppercase tracking-widest text-outline">Mon abonnement</div>
          <div class="font-body-sm text-body-sm ${abo ? "text-secondary" : "text-error"}">${
            abo ? "Actif jusqu'au " + esc(dateFin(abo.fin)) : "Inactif"}</div>
        </div>
        ${abo ? "" : `<a href="activation.html" class="mx-1 text-center bg-secondary text-on-secondary py-2 rounded-lg font-headline-sm text-headline-sm">Activer via WhatsApp</a>`}
        <button id="v-out" class="mx-1 text-center bg-surface-container-low text-error py-2 rounded-lg font-headline-sm text-headline-sm">Se déconnecter</button>`;
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
    if (PAGE === "paiement") {
      const b = document.createElement("div");
      b.className = "mx-gutter-base mt-gutter-base rounded-xl p-gutter-base bg-surface-container-high " +
        "border border-outline-variant text-on-surface-variant font-body-sm text-body-sm";
      b.innerHTML = "<b>PHASE 4 — PAIEMENTS NON ACTIFS.</b> Écran de prévisualisation design uniquement : " +
        "aucun encaissement avant validation du cadre légal béninois (LNB). Rien ne peut être débité ici.";
      document.querySelector("main").prepend(b);
      document.querySelectorAll("button, a").forEach((x) => {
        if (/payer/i.test(x.textContent || "")) { x.disabled = true; x.style.opacity = ".4"; }
      });
    }
    const besoinAuth = ["connexion", "inscription"].includes(PAGE);
    const besoinData = ["accueil", "selections", "corners", "bilan"].includes(PAGE);
    if ((besoinAuth || besoinData) && CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY !== "A_COLLER") {
      SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    if (besoinAuth) {
      if (!SB) banniere("Connexion indisponible : clé publique Supabase absente de assets/config.js.");
      else pageAuth(PAGE);
    }
    if (besoinAuth || besoinData) await sessionPret();
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
      } else if (!window.__ACC.ok && (PAGE === "selections" || PAGE === "corners")) {
        verrou(PAGE);
      }
    }
    etatSession();
  })();
})();
