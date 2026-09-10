/* Harnais vitrine : exécute docs/assets/app.js dans un DOM simulé,
   page par page, avec un Supabase stub (tables vides) et le vrai
   series_jour.json du robot. Attrape les erreurs d'exécution. */
const fs = require("fs"), vm = require("vm");
const SRC = fs.readFileSync("docs/assets/app.js", "utf8");
const CFG = fs.readFileSync("docs/assets/config.js", "utf8");
const SERIES = JSON.parse(fs.readFileSync("/home/user/pronos-foot/data/series_jour.json", "utf8"));

function element(id) {
  const el = {
    id, _html: "", style: {}, dataset: {}, title: "", textContent: "",
    className: "", children: [],
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set cssText(v) {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild: (c) => el.children.push(c), contains: () => false,
    addEventListener: () => {}, prepend: () => {},
  };
  return el;
}
const REG = {};
function makeDoc(page) {
  return {
    body: Object.assign(element("body"), { dataset: { page } }),
    getElementById: (id) => (REG[id] = REG[id] || element(id)),
    querySelector: (s) => (REG[s] = REG[s] || element(s)),
    querySelectorAll: () => [],
    createElement: (t) => element(t),
    addEventListener: () => {},
  };
}
function mkChain(table) {
  const data = table === "abonnements" ? [{ fin: "2026-12-31", plan: "mensuel" }] : [];
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
  const doc = makeDoc(page);
  const errs = [];
  const sandbox = {
    document: doc, console, setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
    navigator: { serviceWorker: undefined, userAgent: "node" },
    location: { href: "", replace: () => {} },
    performance: { now: () => 0 },
    fetch: async (url) => {
      if (String(url).includes("series_jour.json")) return { ok: true, json: async () => SERIES };
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
  await new Promise((r) => setTimeout(r, 600));
  const z = REG["z-contenu"], hdr = REG["hdr"], bnav = REG["bnav"];
  return { page, errs, html: z ? z._html : "", hdr: hdr ? hdr._html : "", bnav: bnav ? bnav._html : "" };
}
(async () => {
  let ko = 0;
  for (const page of ["accueil", "series", "selections", "corners", "bilan"]) {
    const r = await run(page);
    const okHtml = r.html.length > 200;
    const okNav = r.bnav.includes("Séries") && r.hdr.includes("PRONOS");
    const bad = r.errs.length || !okHtml || !okNav;
    if (bad) ko++;
    console.log(`${bad ? "✗" : "✓"} ${page.padEnd(11)} html=${r.html.length} car. nav=${okNav ? "ok" : "MANQUANTE"}${r.errs.length ? " ERREURS: " + r.errs.join(" | ") : ""}`);
    if (page === "accueil") console.log("   contient 'robot mathématique':", r.html.includes("robot mathématique"), "| teaser séries:", r.html.includes("z-series-teaser"));
    if (page === "series") console.log("   matchs du jour rendus:", (r.html.match(/<tr>/g) || []).length, "| safe:", r.html.includes("Safe du jour"), "| grosse cote:", r.html.includes("grosse cote"));
    if (page === "corners") console.log("   verrou abonnés affiché:", r.html.includes("Contenu abonnés"));
  }
  console.log(ko ? `\n${ko} PAGE(S) EN ÉCHEC` : "\nTOUTES LES PAGES PASSENT");
  process.exit(ko ? 1 : 0);
})();
