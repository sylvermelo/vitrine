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

  /* ---------------------------------------------------------- gabarits */
  const PILL = "px-2 py-1 bg-surface-container-highest text-primary font-metric-xs " +
    "text-metric-xs tracking-wider uppercase whitespace-nowrap";

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
    const etat = c.touche == null
      ? `<span class="${PILL}">EN ATTENTE</span>`
      : c.touche
        ? `<span class="px-2 py-1 bg-secondary-container/30 text-secondary font-metric-xs text-metric-xs uppercase">✓ validé</span>`
        : `<span class="px-2 py-1 bg-error-container/30 text-error font-metric-xs text-metric-xs uppercase">✗ perdu</span>`;
    const jambes = (c.jambes || []).slice(0, 4).map((l) =>
      `<div class="flex justify-between gap-2 font-metric-xs text-metric-xs text-on-surface-variant">
         <span class="truncate">· ${esc(l.home)} vs ${esc(l.away)} — ${esc(l.option)}</span>
         <span class="shrink-0">${l.p ? pct(l.p) : ""}</span></div>`).join("");
    return `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-gutter-sm shadow-sm">
      <div class="flex items-center justify-between">
        <span class="font-label-micro text-label-micro uppercase tracking-widest text-primary">${esc((c.nom || "").replace(/_/g, " "))}</span>
        ${etat}
      </div>
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
        SB.from("combines").select("*").order("jour", { ascending: false }).limit(120),
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
    const row = feuilleParTexte("Arsenal vs Chelsea");
    if (row) {
      const ligne = monte(row, LIGNE);
      const wrapper = ligne && ligne.parentElement;
      if (wrapper) {
        const z = document.createElement("div");
        z.id = "v-sel";
        z.className = "divide-y divide-surface-container-low flex flex-col";
        wrapper.parentElement.replaceChild(z, wrapper);
        z.innerHTML = sels.length ? sels.map(ligneSelection).join("") :
          `<div class="p-gutter-base font-body-sm text-body-sm text-on-surface-variant">Aucune sélection archivée pour l'instant — le robot publie chaque heure.</div>`;
      }
    }
    const resolues = D.sel.filter((s) => s.touche != null);
    const touches = resolues.filter((s) => s.touche).length;
    if (resolues.length) majTexte("78 %", Math.round(100 * touches / resolues.length) + " %", true);
    majTexte("Source ESPN", `source ESPN · ${touches}/${resolues.length} vérifiées`);
  }

  function pageSelections(D) {
    const auj = aujourdHui();
    const jours = [...new Set(D.sel.map((s) => s.jour))].sort().reverse();
    let jour = jours.find((j) => j >= auj) || jours[0] || auj;
    const zListe = conteneurParRepere("Liverpool", CARTE, "s-list");
    const zComb = conteneurParRepere("SAFE DU JOUR", CARTE, "s-comb");
    const rend = () => {
      if (zListe) {
        const sels = D.sel.filter((s) => s.jour === jour).sort((a, b) => (b.p || 0) - (a.p || 0));
        zListe.innerHTML = sels.length
          ? `<div class="divide-y divide-surface-container-low flex flex-col rounded-xl overflow-hidden bg-surface-container-low">${sels.map(ligneSelection).join("")}</div>`
          : `<div class="rounded-xl bg-surface-container-low p-gutter-base font-body-sm text-body-sm text-on-surface-variant">Aucune sélection ce jour-là — le robot s'abstient quand la qualité n'y est pas.</div>`;
      }
      if (zComb) {
        const combs = D.comb.filter((c) => c.jour === jour && c.nom !== "corners_montante");
        zComb.innerHTML = combs.length
          ? `<div class="flex flex-col gap-gutter-sm">${combs.map(carteCombine).join("")}</div>`
          : `<div class="font-body-xs text-body-xs text-on-surface-variant">Pas de combiné archivé ce jour.</div>`;
      }
    };
    rend();
    if (zListe) {
      const chips = document.createElement("div");
      chips.className = "flex gap-2 overflow-x-auto pb-gutter-sm";
      const pose = () => {
        chips.innerHTML = jours.slice(0, 12).map((j) =>
          `<button data-j="${j}" class="px-3 py-1.5 rounded-lg font-metric-xs text-metric-xs whitespace-nowrap ${j === jour ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}">${j === auj ? "AUJOURD'HUI" : j}</button>`).join("");
        chips.querySelectorAll("button").forEach((b) => b.onclick = () => { jour = b.dataset.j; pose(); rend(); });
      };
      pose();
      zListe.parentElement.prepend(chips);
    }
  }

  function pageCorners(D) {
    const cp = D.comb.filter((c) => c.nom === "corners_montante")
      .sort((a, b) => (b.jour || "").localeCompare(a.jour || ""))[0];
    const z = conteneurParRepere("Aston Villa vs Wolves", CARTE, "c-legs");
    if (!cp) {
      majTexte("1.85", "—", true);
      majTexte("54 %", "—", true);
      if (z) z.innerHTML = `<div class="rounded-xl bg-surface-container-low p-gutter-base flex flex-col gap-2">
        <div class="font-headline-md text-headline-md text-on-surface">AUCUN COUPON CE JOUR</div>
        <div class="font-body-sm text-body-sm text-on-surface-variant">Aucun match n'atteint 85 % de fréquence
        réelle mesurée sur son meilleur handicap corners. Mieux vaut sauter un jour que forcer —
        discipline algorithmique absolue.</div></div>`;
      return;
    }
    majTexte("1.85", f2(cp.cote), true);
    majTexte("54 %", pct(cp.p_combine), true);
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
    if (resolues.length) majTexte("78 %", Math.round(100 * touches / resolues.length) + " %", true);
    majTexte("sélections touchées (43/55)", `sélections touchées (${touches}/${resolues.length})`);
    let roi = 0, n = 0;
    for (const s of resolues) {
      if (s.cote_marche == null) continue;
      roi += s.touche ? s.cote_marche - 1 : -1; n++;
    }
    majTexte("+2.1 u", (roi >= 0 ? "+" : "") + roi.toFixed(1) + " u", true);
    majTexte("ROI simulé sur 30 jours", `ROI simulé sur ${n} sélections cotées`);
    const parMois = {};
    for (const s of resolues) {
      const m = (s.jour || "").slice(0, 7);
      (parMois[m] = parMois[m] || { t: 0, n: 0 });
      parMois[m].n++; if (s.touche) parMois[m].t++;
    }
    const mois = Object.keys(parMois).sort().slice(-6);
    const leafMois = feuilleParTexte("OCT");
    if (leafMois && mois.length) {
      const col = leafMois.parentElement;
      const ligne = col && col.parentElement;
      if (ligne) {
        const z = document.createElement("div");
        z.id = "b-mois";
        z.className = "flex items-end justify-between gap-2 px-gutter-base";
        z.style.height = "160px";
        ligne.parentElement.replaceChild(z, ligne);
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
    const zM = conteneurParRepere("Under 2.5", /flex flex-col gap-1|flex-col/, "b-marches");
    if (zM && top.length) {
      zM.className = "flex flex-col gap-gutter-sm";
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
  function pageAuth(mode) {
    const segTel = feuilleParTexte("Téléphone (Bénin)") || feuilleParTexte("NUMÉRO TERMINAL GSM");
    if (segTel) {
      const btn = monte(segTel, /rounded|bg-surface/) || segTel;
      btn.style.opacity = ".45";
      btn.title = "OTP SMS : bientôt (passerelle payante requise)";
    }
    let email = document.querySelector("main input[type=email]");
    if (!email) {
      const tel = document.querySelector("main input[type=tel], main input[inputmode=tel], main input[placeholder*='97']");
      if (tel) {
        tel.type = "email"; tel.placeholder = "ton@email.com";
        tel.removeAttribute("inputmode"); tel.removeAttribute("maxlength");
        email = tel;
        const lab = feuilleParTexte("CANAL NUMÉRIQUE (+229)") || feuilleParTexte("NUMÉRO TERMINAL GSM");
        if (lab) lab.textContent = "ADRESSE E-MAIL";
      }
    }
    const mdp = document.querySelector("main input[type=password]");
    const bouton = [...document.querySelectorAll("main button, main a")]
      .find((b) => /Déverrouiller|Recevoir le code|Créer mon compte/i.test(b.textContent || ""));
    const msg = document.createElement("div");
    msg.className = "mt-gutter-sm font-body-sm text-body-sm text-primary px-gutter-base";
    if (bouton) bouton.parentElement.appendChild(msg);
    const google = [...document.querySelectorAll("main button")]
      .find((b) => /Google/i.test(b.textContent || ""));
    if (google) google.onclick = async () => {
      try {
        await SB.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html" } });
      } catch (e) { msg.textContent = "Google : à activer côté Supabase (Auth → Providers)."; }
    };
    if (!bouton || !email || !mdp) {
      msg.textContent = "Formulaire incomplet — signale-le, je corrige.";
      return;
    }
    bouton.onclick = async (e) => {
      e.preventDefault();
      msg.textContent = "…";
      const coche = document.querySelector("main input[type=checkbox]");
      if (mode === "inscription" && coche && !coche.checked) {
        msg.textContent = "Coche la certification (18 ans + conditions) d'abord.";
        return;
      }
      try {
        if (mode === "connexion") {
          const r = await SB.auth.signInWithPassword({ email: email.value.trim(), password: mdp.value });
          if (r.error) throw r.error;
          msg.textContent = "Connecté — retour à l'accueil.";
          setTimeout(() => location.href = "index.html", 700);
        } else {
          const r = await SB.auth.signUp({ email: email.value.trim(), password: mdp.value });
          if (r.error) throw r.error;
          msg.textContent = r.data.session ? "Compte créé, bienvenue."
            : "Compte créé : confirme ton e-mail puis connecte-toi.";
        }
      } catch (err) { msg.textContent = err.message || String(err); }
    };
  }

  function etatSession() {
    const btn = document.getElementById("v-compte");
    if (!btn || !SB) return;
    SB.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        btn.title = "Se déconnecter (" + (data.session.user.email || "") + ")";
        btn.style.outline = "2px solid #4ae176";
        btn.onclick = async () => { await SB.auth.signOut(); location.reload(); };
      } else btn.onclick = () => location.href = "connexion.html";
    });
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
    if (besoinData) {
      const D = await charge();
      if (D) {
        if (PAGE === "accueil") pageAccueil(D);
        if (PAGE === "selections") pageSelections(D);
        if (PAGE === "corners") pageCorners(D);
        if (PAGE === "bilan") pageBilan(D);
      }
    }
    etatSession();
  })();
})();
