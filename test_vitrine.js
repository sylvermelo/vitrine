/* Harnais vitrine (11/09) : exécute docs/assets/app.js dans un DOM simulé,
   page par page, avec un Supabase stub (sélections + combinés de démo) et les
   VRAIS JSON du robot (corners_jour.json, affilee_suivi.json).
   Simule aussi un clic sur CHAQUE onglet pour tester les rendus cachés
   (SAFE, Combiné, But d'affilée). */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync("docs/assets/app.js", "utf8");
const CFG = fs.readFileSync("docs/assets/config.js", "utf8");
const DATA_ROBOT = "/home/user/pronos-foot/data/";
const CORNERS = JSON.parse(fs.readFileSync(DATA_ROBOT + "corners_jour.json", "utf8"));
const AFFILEE = JSON.parse(fs.readFileSync(DATA_ROBOT + "affilee_suivi.json", "utf8"));

const auj = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
const hier = new Date(Date.now() + 3600000 - 86400000).toISOString().slice(0, 10);
const hier2 = new Date(Date.now() + 3600000 - 2 * 86400000).toISOString().slice(0, 10);

const jambe = (home, away, option, p, resolu) => ({
  div: "E0", ligue: "Premier League", date: auj, heure: "20:00", home, away, option, p,
  cote_juste: Math.round((1 / p) * 100) / 100,
  resultat: resolu == null ? null : { touche: resolu, buts_home: 2, buts_away: 1, resolu_le: hier },
});
const SEL_ROWS = [
  { jour: auj, div: "E0", ligue: "Premier League", heure: "20:00", home: "Arsenal", away: "Chelsea", option: "over 1.5", p: 0.83, cote_juste: 1.2, confiance: "haute", touche: null },
  { jour: hier, div: "SP1", ligue: "La Liga", heure: "19:00", home: "Sevilla", away: "Getafe", option: "double chance 1X", p: 0.88, cote_juste: 1.14, touche: true, buts_home: 2, buts_away: 0 },
  { jour: hier2, div: "I1", ligue: "Serie A", heure: "18:00", home: "Torino", away: "Genoa", option: "over 1.5", p: 0.8, cote_juste: 1.25, touche: false, buts_home: 0, buts_away: 0 },
];
const COMB_ROWS = [
  { jour: auj, nom: "safe", p_combine: 0.8, cote: 1.25, touche: null, jambes: [jambe("Liverpool", "Everton", "over 1.5", 0.9, null), jambe("Real Madrid", "Osasuna", "double chance 1X", 0.89, null)], brut: {} },
  { jour: hier, nom: "safe", p_combine: 0.81, cote: 1.23, touche: true, jambes: [jambe("Bayern Munich", "Kiel", "over 1.5", 0.9, true)], brut: {} },
  { jour: hier, nom: "safe_weekend", p_combine: 0.7, cote: 1.42, touche: false, jambes: [jambe("Paris SG", "Nantes", "over 1.5", 0.88, true), jambe("Inter", "Pisa", "double chance 1X", 0.9, false)], brut: {} },
  { jour: auj, nom: "cote2", p_combine: 0.48, cote: 2.08, touche: null, jambes: [jambe("Arsenal", "Chelsea", "over 1.5", 0.83, null), jambe("Liverpool", "Everton", "over 1.5", 0.9, null)], brut: {} },
  { jour: hier, nom: "cote5", p_combine: 0.2, cote: 5.0, touche: true, jambes: [jambe("Real Madrid", "Osasuna", "les deux marquent", 0.55, true)], brut: {} },
  { jour: hier, nom: "cote2", p_combine: 0.5, cote: 2.0, touche: true, jambes: [jambe("Bayern Munich", "Kiel", "over 1.5", 0.9, true)], brut: {} },
];

const REG = {};
const LISTENERS = [];          /* [tag, fn] — clics capturés sur les onglets */
function tabButton(idTab) {
  return {
    dataset: { tab: idTab }, className: "tab",
    classList: { toggle: () => {} },
    addEventListener: (ev, fn) => { if (ev === "click") LISTENERS.push([idTab, fn]); },
  };
}
function element(id) {
  const el = {
    id, _html: "", style: {}, dataset: {}, title: "", textContent: "",
    className: "", children: [],
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set cssText(v) {},
    querySelector: (s) => (REG[s] = REG[s] || element(s)),
    querySelectorAll: (sel) => {
      if (sel !== ".tab") return [];
      const ids = [...el._html.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
      return ids.map(tabButton);
    },
    appendChild: (c) => el.children.push(c), contains: () => false,
    addEventListener: () => {}, prepend: () => {},
  };
  return el;
}
function makeDoc(page) {
  return {
    body: Object.assign(element("body"), { dataset: { page } }),
    getElementById: (i) => (REG[i] = REG[i] || element(i)),
    querySelector: (s) => (REG[s] = REG[s] || element(s)),
    querySelectorAll: () => [],
    createElement: (t) => element(t),
    addEventListener: () => {},
  };
}
function mkChain(table) {
  const data = table === "abonnements" ? [{ fin: "2026-12-31", plan: "mensuel" }]
    : table === "selections" ? SEL_ROWS
    : table === "combines" ? COMB_ROWS : [];
  const proxy = new Proxy(function () {}, {
    get: (t, k) => {
      if (k === "then") return (res) => res({ data });
      if (k === "data") return data;
      if (k === Symbol.toPrimitive) return () => "";
      return proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}
const SB = {
  from: (t) => mkChain(t),
  auth: {
    getSession: async () => ({ data: { session: { user: { id: "u1", email: "t2290196575755@tel.pronos-foot.bj" } } } }),
    onAuthStateChange: () => {}, signOut: async () => {},
  },
};
async function run(page) {
  for (const k of Object.keys(REG)) delete REG[k];
  LISTENERS.length = 0;
  const doc = makeDoc(page);
  const errs = [];
  const sandbox = {
    document: doc, console, setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
    navigator: { serviceWorker: undefined, userAgent: "node" },
    location: { href: "", replace: () => {} },
    performance: { now: () => 0 },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("corners_jour.json")) return { ok: true, json: async () => CORNERS };
      if (u.includes("affilee_suivi.json")) return { ok: true, json: async () => AFFILEE };
      return { ok: false, json: async () => ({}) };
    },
    window: null, Promise, JSON, Math, Date, Object, Array,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.supabase = { createClient: () => SB };
  vm.createContext(sandbox);
  try { vm.runInContext(CFG, sandbox); } catch (e) { errs.push("config: " + e.message); }
  try { vm.runInContext(SRC, sandbox, { timeout: 8000 }); } catch (e) { errs.push("app.js: " + e.message); }
  await new Promise((r) => setTimeout(r, 700));
  /* clique chaque onglet capturé, garde un instantané du rendu */
  const snaps = {};
  for (const [tag, fn] of LISTENERS) {
    try { fn(); snaps[tag] = REG["#tab-contenu"] ? REG["#tab-contenu"]._html : ""; }
    catch (e) { errs.push("onglet " + tag + ": " + e.message); }
  }
  const tabEl = REG["#tab-contenu"];
  const z = REG["z-contenu"], hdr = REG["hdr"], bnav = REG["bnav"];
  const zbx = REG["z-bilan-exotique"];
  return { page, errs, html: z ? z._html : "", tab: tabEl ? tabEl._html : "", snaps,
           zbx: zbx ? zbx._html : "", hdr: hdr ? hdr._html : "", bnav: bnav ? bnav._html : "" };
}
(async () => {
  let ko = 0;
  const checks = {
    accueil: (r) => [
      ["volet mois", r.html.includes("Ce mois-ci")],
      ["PLUS de « à zéro le 1er »", !r.html.includes("à zéro le 1er")],
      ["hier : conseil = 1/1 · 100 %", r.html.includes("1/1 · 100 %")],
      ["hier : mot « manqué » absent", !r.html.includes("manqué")],
      ["bilan exotique (async)", r.zbx.includes("Bilan exotique") && r.zbx.includes("corners touchés")],
      ["4 compteurs", r.html.includes("conseils touchés") && r.html.includes("SAFE touchés") && r.html.includes("cote 2 touchés") && r.html.includes("cote 5 touchés")],
      ["hier SANS détail de matchs", r.html.includes("Hier —") && !r.html.includes("Sevilla")],
      ["aujourd'hui gardé", r.html.includes("Aujourd'hui") && r.html.includes("Arsenal")],
      ["robot mathématique", r.html.includes("robot mathématique")],
      ["PLUS de « matchs réels en base »", !r.html.includes("matchs réels en base")],
      ["PLUS de buts d'affilée sur l'accueil", !r.html.includes("z-series-teaser")],
      ["PLUS de coupon corners", !r.html.includes("montante")],
      ["avertissement en bas", r.html.includes("jamais un conseil financier") || r.html.includes("warn")],
    ],
    selections: (r) => [
      ["3 onglets", r.html.includes('data-tab="jour"') && r.html.includes('data-tab="safe"') && r.html.includes('data-tab="combine"')],
      ["jour : Arsenal", r.html.includes("Arsenal")],
      ["onglet SAFE : safe du jour", (r.snaps.safe || "").includes("SAFE DU JOUR") && (r.snaps.safe || "").includes("Liverpool")],
      ["onglet SAFE : cotes justes", (r.snaps.safe || "").includes("cote juste")],
      ["onglet SAFE : week-end", (r.snaps.safe || "").includes("WEEK-END")],
      ["onglet Combiné : cote 2 du jour", (r.snaps.combine || "").includes("COTE 2 DU JOUR")],
      ["onglet Combiné : PAS la cote 5 résolue d'hier", !(r.snaps.combine || "").includes("COTE 5") && !(r.snaps.combine || "").includes("validé")],
      ["onglet Combiné : score sous le match", (r.snaps.combine || "").includes("case-score") || !(r.snaps.combine || "").includes("touché")],
      ["avertissement en bas", r.html.includes("warn")],
    ],
    exotiques: (r) => [
      ["2 onglets", r.html.includes('data-tab="corners"') && r.html.includes('data-tab="affilee"')],
      ["corners : sélections du jour", (r.snaps.corners || r.tab).includes("sélections du jour")],
      ["corners : cases + couleur", (r.snaps.corners || r.tab).includes("pct-badge") && /p-(vert|ambre|rouge)/.test(r.snaps.corners || r.tab)],
      ["corners : PLUS de coupon", !(r.snaps.corners || r.tab).includes("montante")],
      ["affilée : rendue", (r.snaps.affilee || "").includes("But d'affilée — aujourd'hui")],
      ["affilée : NON seulement", (r.snaps.affilee || "").includes("NON") && !(r.snaps.affilee || "").includes("— OUI")],
      ["affilée : résultats", (r.snaps.affilee || "").includes("touché") || (r.snaps.affilee || "").includes("en attente")],
      ["avertissement 60-100", r.html.includes("60 et 100")],
    ],
    bilan: (r) => [
      ["saison depuis le 1er août", r.html.includes("Bilan de la saison") && r.html.includes("depuis le 01/08")],
      ["4 catégories", r.html.includes("conseils touchés") && r.html.includes("SAFE touchés") && r.html.includes("cote 2 touchés")],
      ["graphe mensuel", r.html.includes("Historique mensuel")],
      ["7 derniers jours", r.html.includes("7 derniers jours")],
      ["PLUS de dernière sélection résolue", !r.html.includes("Dernière sélection résolue")],
      ["bilan exotique par saison", r.zbx.includes("Bilan exotique") && r.zbx.includes("buts d'affilée touchés")],
      ["avertissement en bas", r.html.includes("warn")],
    ],
    abonnement: (r) => [
      ["statut actif", r.html.includes("jours restants") && r.html.includes("expire le")],
      ["cumul +30 jours", r.html.includes("Cumuler") && r.html.includes("Ajouter 30 jours")],
      ["historique", r.html.includes("Historique")],
      ["avertissement", r.html.includes("warn")],
    ],
  };
  for (const page of ["accueil", "selections", "exotiques", "bilan", "abonnement"]) {
    const r = await run(page);
    const okNav = r.bnav.includes("Exotiques") && r.bnav.includes("Abonnement") && !r.bnav.includes("Séries") && r.hdr.includes("PRONOS");
    const res = (checks[page] || (() => []))(r);
    const bad = r.errs.length || !okNav || res.filter(([, ok]) => !ok).length;
    if (bad) ko++;
    console.log(`${bad ? "✗" : "✓"} ${page.padEnd(11)} html=${r.html.length} car. onglets=${Object.keys(r.snaps).length} nav=${okNav ? "ok" : "MANQUANTE"}`);
    for (const [lb, ok] of res) if (!ok) console.log(`    MANQUE : ${lb}`);
    if (r.errs.length) console.log("    ERREURS : " + r.errs.join(" | "));
  }
  console.log(ko ? `\n${ko} PAGE(S) EN ÉCHEC` : "\nTOUTES LES PAGES PASSENT");
  process.exit(ko ? 1 : 0);
})();
