/* One service-worker lifecycle for every page and installed app entry. */
(() => {
  if (!('serviceWorker' in navigator)) return;
  let controller = navigator.serviceWorker.controller;
  let offered = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controller || offered) { controller = navigator.serviceWorker.controller; return; }
    offered = true;
    // Preserve form input and sessions; the user chooses when to reload.
    const note = document.createElement('div');
    note.className = 'update-toast'; note.setAttribute('role', 'status');
    note.innerHTML = '<span>Une nouvelle version est prête.</span><button type="button">Actualiser</button>';
    note.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(note);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
})();
