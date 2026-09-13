(function () {
  'use strict';
  function reloadOnce(key) {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
    } catch (e) {}
    try { location.reload(); } catch (e) {}
    return true;
  }

  var SPLASH_TIMEOUT = 5000;
  var LOADER_TIMEOUT = 30000;

  function isSplashStuck() {
    var root = document.getElementById('root');
    if (!root) return false;
    return !!root.querySelector('.splash') && !document.querySelector('.app');
  }

  // Récupération d'une page bloquée sur le splash (ancien shell servi par un
  // ancien service worker dont les chunks ne sont plus déployés) :
  // 1) forcer la mise à jour du service worker (nouvelle version installée +
  //    activée en ~1-2 s), 2) recharger la page — le nouveau SW est configuré
  //    en réseau d'abord et servira l'HTML frais.
  function recoveryReload() {
    setTimeout(function () {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            if (regs && regs.length) {
              regs[0].update().then(function () {
                // Laisse le temps au nouveau SW d'activer et de claim()
                setTimeout(function () { location.reload(); }, 1200);
              });
              return;
            }
            location.reload();
          });
          return;
        }
      } catch (e) {}
      location.reload();
    }, 300);
  }

  function ensureRecoveryButton() {
    var root = document.getElementById('root');
    if (!root || document.body.contains(document.getElementById('mboppi-recover-button'))) return;
    var btn = document.createElement('button');
    btn.id = 'mboppi-recover-button';
    btn.textContent = '↻ Recharger le site';
    btn.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:999999;background:#4f46e5;color:#fff;' +
      'border:0;border-radius:12px;padding:14px 20px;font:600 15px system-ui;cursor:pointer;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.35)';
    btn.onclick = function () { location.reload(); };
    document.body.appendChild(btn);
  }

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (!isSplashStuck()) return;
      try {
        var attempts = Number(sessionStorage.getItem('mboppi_recover_attempts') || 0);
        if (attempts >= 2) {
          // Trop d'échecs automatiques : bouton manuel visible pour sortir
          // de la boucle immédiatement.
          ensureRecoveryButton();
          return;
        }
        sessionStorage.setItem('mboppi_recover_attempts', String(attempts + 1));
      } catch (e) {}
      recoveryReload();
    }, SPLASH_TIMEOUT);
  });

  var loaderSince = null;
  setInterval(function () {
    var loader = document.querySelector('.route-loader');
    if (loader) {
      if (loaderSince === null) loaderSince = Date.now();
      if (Date.now() - loaderSince > LOADER_TIMEOUT) {
        loaderSince = null;
        reloadOnce('mboppi_loader_retried');
      }
    } else {
      loaderSince = null;
    }
  }, 3000);
})();
