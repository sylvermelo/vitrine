/* Browser integration: navigation, responsive layout, auth wiring, and offline shell.
   Run with playwright installed and CHROMIUM_PATH pointing to a local Chromium. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const dir=path.resolve('docs');
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
 const file=path.resolve(dir,rel); if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 if(rel==='assets/config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.VITRINE_CONFIG={SUPABASE_URL:"https://example.invalid",SUPABASE_ANON_KEY:"test-only"};');return;}
 try{const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)];res.setHeader('Content-Type',type||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
function installStub() {
 window.__authCalls=[];
 window.supabase={createClient(){
  const chain=new Proxy({}, {get(t,k){if(k==='then') return r=>Promise.resolve(r({data:[],error:null})); return ()=>chain;}});
  return {from:()=>chain,rpc:async()=>({data:false,error:null}),auth:{
   getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
   signInWithPassword:async x=>{window.__authCalls.push(x);return {error:{message:'Invalid login credentials'}}},
   signUp:async x=>{window.__authCalls.push(x);return {error:{message:'Test signup intercepted'}}},
   signInWithOAuth:async()=>({error:{message:'Test OAuth intercepted'}})
  }};
 }};
}
const stub='('+installStub.toString()+')();';
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/assets/config.js'))return route.fulfill({contentType:'text/javascript',body:'window.VITRINE_CONFIG={SUPABASE_URL:"https://example.invalid",SUPABASE_ANON_KEY:"test-only"};'});if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'text/javascript',body:stub});if(url.startsWith(base))return route.continue();return route.fulfill({contentType:'application/json',body:'{}'});});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:950});
  for(const name of ['index','connexion','inscription','acces','activation','hockey','europe','selections','abonnement','bilan','conditions','confidentialite','paiement']){
   await page.goto(base+'/'+name+'.html');await page.locator('#hdr .brand').waitFor();
   assert.equal(await page.locator('header').count(),1,name+' has duplicate header');
   assert.equal(await page.locator('header img').count(),1,name+' has duplicate logo');
   if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))) console.log(await page.locator('body *').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>[e.tagName,e.className,e.getBoundingClientRect().width])));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow at '+width);
   if(name==='index'){
    const boxes=await page.locator('.sport-card').evaluateAll(els=>els.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.offsetWidth,h:e.offsetHeight})));
    assert.equal(boxes[0].y,boxes[1].y,'Sports must stay side by side');assert.equal(boxes[0].h,boxes[1].h);assert(boxes[1].x>boxes[0].x);
    assert.equal(await page.locator('.sport-hub a').count(),2);
   }
   if([390,1366].includes(width)&&['index','connexion'].includes(name))await page.screenshot({animations:'disabled',path:'/tmp/pronoclair-'+name+'-'+width+'.png',fullPage:true});
  }
  console.log('Responsive shell checked at '+width+'px');
 }
 await page.goto(base+'/connexion.html');
 await page.getByRole('tab',{name:'E-mail',exact:true}).click();
 assert.equal(await page.locator('#panel-phone').isVisible(),false);
 await page.getByLabel('Adresse e-mail',{exact:true}).fill('navigation-test@example.invalid');
 await page.getByLabel('Mot de passe',{exact:true}).fill('fixture-only-password');
 await page.getByRole('button',{name:'Afficher le mot de passe'}).click();
 assert.equal(await page.locator('#password-input').getAttribute('type'),'text');
 await page.locator('#password-input').press('Enter');
 await page.getByText('Identifiant ou mot de passe incorrect.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__authCalls.length),1,'Submit once using keyboard');
 await page.getByRole('tab',{name:'Téléphone',exact:true}).click();
 await page.getByRole('button',{name:'Choisir l’indicatif du pays'}).click();
 await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'Continuer avec Google'}).click();
 await page.getByText('La connexion Google est indisponible pour le moment. Utilise ton téléphone ou ton e-mail.',{exact:true}).waitFor();
 await page.goto(base+'/inscription.html');
 await page.getByRole('button',{name:'Créer mon compte'}).click();
 await page.getByText('Coche la certification (18 ans + conditions) d’abord.'.replace('d’abord',"d'abord"),{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Auth checked: tabs, country picker, password visibility, keyboard submit, error states, signup consent.');
 // Cache migration and offline return to the installed application's start page.
 const offlineContext=await browser.newContext({serviceWorkers:'allow',reducedMotion:'reduce'});
 await offlineContext.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.fulfill({body:'',status:503}));
 const offlinePage=await offlineContext.newPage();
 await offlinePage.goto(base+'/index.html');
 await offlinePage.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await offlinePage.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 await offlinePage.evaluate(async()=>{
  const cache=await caches.open('vitrine-obsolete-test');await cache.put('/old-logo.png',new Response('old'));
  await navigator.serviceWorker.getRegistration().then(r=>r.unregister());
 });
 await offlinePage.reload();
 await offlinePage.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await offlinePage.waitForFunction(async()=>!(await caches.keys()).includes('vitrine-obsolete-test'));
 await offlineContext.setOffline(true);
 await offlinePage.reload();
 assert.equal(await offlinePage.locator('.sport-card').count(),2);
 assert.equal(await offlinePage.locator('header img').getAttribute('src'),'assets/pronoclair.svg?v=20261023-studio');
 assert.equal(await offlinePage.locator('.sport-card').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(237, 245, 237)');
 console.log('PWA: old shell cache removed, offline start page and versioned styles verified.');
 await offlineContext.close();await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
