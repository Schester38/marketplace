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

  var SPLASH_TIMEOUT = 20000;
  var LOADER_TIMEOUT = 30000;

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var root = document.getElementById('root');
      if (!root) return;
      var mounted = document.querySelector('.app');
      var stillSplash = root.querySelector('.splash');
      if (stillSplash && !mounted) {
        reloadOnce('mboppi_splash_retried');
      }
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
