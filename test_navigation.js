/* Navigation hierarchy regression: independent of login and remote data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = name => fs.readFileSync(`docs/${name}.html`, 'utf8');
const home = read('index');
const hub = home.match(/<section class="sport-hub"[\s\S]*?<\/section>/)[0];
assert.deepEqual([...hub.matchAll(/href="([^"]+)"/g)].map(m=>m[1]), ['selections.html','hockey.html']);
assert.match(hub, /class="sport-soon" aria-disabled="true"/);
assert.match(hub, /Basket/);
assert.match(hub, /À venir/);
assert(!home.includes('href="europe.html"'));
for (const name of ['selections','europe','exotiques']) {
  const html=read(name);
  const nav=html.match(/<nav class="football-nav"[\s\S]*?<\/nav>/)[0];
  assert(nav.includes(`href="${name}.html" aria-current="page"`));
  assert(nav.includes('href="europe.html"'));
  assert(!html.includes('sport-hub'));
  assert(html.includes('href="index.html">Accueil'));
}
assert(!read('hockey').includes('football-nav'));
assert(!fs.readFileSync('docs/assets/app.js','utf8').includes('sports-quick'));
console.log('Navigation: two active sports on home, Basket coming soon, Europe nested in Football.');
