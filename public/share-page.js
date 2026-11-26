// Bouton « Partager cette page » (partage natif si disponible, sinon copie du lien canonique).
(function () {
  var b = document.getElementById('share');
  if (!b) return;
  b.hidden = false;
  b.addEventListener('click', function () {
    var link = (document.querySelector('link[rel=canonical]') || {}).href || location.href;
    if (navigator.share) { navigator.share({ title: b.dataset.title, url: link }).catch(function () {}); return; }
    var done = function () { var t = b.textContent; b.textContent = b.dataset.copied; setTimeout(function () { b.textContent = t; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () {}); else { window.prompt('', link); }
  });
})();
