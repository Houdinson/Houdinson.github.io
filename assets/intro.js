/* Ekran startowy: pełna animacja przy pierwszej wizycie w sesji, krótka przy kolejnych.
   Znika, gdy strona jest gotowa (window.stlIntroDone) albo po kliknięciu / klawiszu. */
(function () {
  var el = document.getElementById('intro'); if (!el) return;
  var seen = false; try { seen = sessionStorage.getItem('stl_intro') === '1'; sessionStorage.setItem('stl_intro', '1'); } catch (e) { /* tryb prywatny */ }
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement, t0 = Date.now();
  var MIN = rm ? 350 : seen ? 650 : 2400, MAX = seen ? 2500 : 6500;
  var ready = false, readyAt = 0, done = false, p = 0, last = t0;
  var bar = el.querySelector('.i-bar i'), pct = el.querySelector('.i-pct'), line = el.querySelector('.i-line');
  var LINES = ['Uruchamianie', 'Test podzespołów', 'Kalibracja chłodzenia', 'Wolne terminy', 'Gotowe'];
  if (seen) el.classList.add('quick');
  root.classList.add('intro-on');
  function frame() {
    if (done) return;
    var now = Date.now(), t = now - t0, dt = Math.min(250, now - last), target = ready ? 100 : Math.min(90, t / MIN * 85);
    last = now;
    p += (target - p) * (1 - Math.exp(-dt / (ready ? 90 : 260)));   // płynnie niezależnie od liczby klatek
    if (bar) bar.style.width = p.toFixed(1) + '%';
    if (pct) pct.textContent = Math.round(p) + '%';
    if (line) line.textContent = LINES[Math.min(LINES.length - 1, Math.floor(p / 100 * (LINES.length - 1) + 0.0001))];
    if (ready && t >= MIN && (p > 99.4 || now - readyAt > 450)) return finish();
    requestAnimationFrame(frame);
  }
  function finish() {
    if (done) return; done = true;
    if (bar) bar.style.width = '100%'; if (pct) pct.textContent = '100%'; if (line) line.textContent = LINES[LINES.length - 1];
    el.classList.add('out'); root.classList.remove('intro-on');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, rm ? 350 : 1500);
  }
  function setReady() { if (!ready) { ready = true; readyAt = Date.now(); } }
  window.stlIntroDone = setReady;
  el.addEventListener('click', finish);
  addEventListener('keydown', function k() { removeEventListener('keydown', k); finish(); });
  addEventListener('load', function () { setTimeout(setReady, 1800); });
  setTimeout(setReady, MAX);
  requestAnimationFrame(frame);
})();
