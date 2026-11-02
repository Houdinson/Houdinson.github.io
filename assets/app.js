'use strict';
/* =====================================================================
   STRIKE TECH LAB – logika strony (bez frameworków)
   Pliki: config.js (konfiguracja), assets/app.css (style), assets/app.js (ten plik),
   assets/admin.js (panel administratora, wczytywany tylko dla admina), assets/intro.js (ekran startowy).
   Backend: Supabase (baza + logowanie + Edge Functions) + Stripe Checkout.
   Konfiguracja: obiekt window.STL_CONFIG w pliku config.js.
   ===================================================================== */
const CFG = Object.assign({
  SUPABASE_URL: '', SUPABASE_KEY: '', DEV_SUPABASE_URL: 'http://127.0.0.1:54321', DEV_SUPABASE_KEY: '',
  SUPABASE_JS_LOCAL: 'vendor/supabase.js',                                         // kopia lokalna (zalecana – bez zewnętrznego CDN)
  SUPABASE_JS: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',   // zapas, gdy brak kopii lokalnej
  CONTACT_EMAIL: 'striketechlab@proton.me', HEARTBEAT_MS: 45000,
}, window.STL_CONFIG || {});
const CO = Object.assign({ NAME: '', ADDRESS: '', NIP: '', REGON: '', PHONE: '', REGISTRY: '', RETURN_ADDRESS: '', HOSTING: '', MAIL_PROVIDER: '' }, CFG.COMPANY || {});
async function loadSupabaseLib() {
  if (window.supabase?.createClient) return window.supabase.createClient;
  if (CFG.SUPABASE_JS_LOCAL) {
    try {
      await new Promise((ok, no) => { const el = document.createElement('script'); el.src = BASE + CFG.SUPABASE_JS_LOCAL.replace(/^\/+/, ''); el.onload = ok; el.onerror = no; document.head.append(el); });
      if (window.supabase?.createClient) return window.supabase.createClient;
    } catch { log('brak lokalnej kopii biblioteki – używam CDN'); }
  }
  return (await import(CFG.SUPABASE_JS)).createClient;
}

/* ------------------------------------------------------------------ narzędzia */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const TZ = 'Europe/Warsaw';
const BASE = ('/' + String(CFG.BASE_PATH || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const SITE_URL = location.origin + BASE;              // np. http://localhost:3000/
const ROUTES = {
  '/': ['home', 'Strike Tech Lab | Optymalizacja, serwis i zestawy PC'],
  '/uslugi': ['uslugi', 'Usługi i cennik | Strike Tech Lab'],
  '/zestawy': ['zestawy', 'Zestawy PC | Strike Tech Lab'],
  '/rezerwacja': ['rezerwacja', 'Rezerwacja terminu | Strike Tech Lab'],
  '/konto': ['konto', 'Strefa Klienta | Strike Tech Lab'],
  '/kontakt': ['kontakt', 'Kontakt i FAQ | Strike Tech Lab'],
};
const LEGACY_HASH = { '#start': '/', '#proces': '/', '#uslugi': '/uslugi', '#zakres': '/uslugi', '#benchmark': '/uslugi', '#zestawy': '/zestawy', '#rezerwacja': '/rezerwacja', '#panel': '/konto', '#kontakt': '/kontakt', '#faq': '/kontakt', '#prawne': '/' };
function currentRoute() {
  let p = location.pathname;
  if (p.startsWith(BASE)) p = '/' + p.slice(BASE.length);
  p = p.replace(/(index)?\.html$/, '').replace(/\/+$/, '') || '/';
  return ROUTES[p] ? p : '/';
}
let route = '/';
function navigate(to, { replace = false, keepScroll = false } = {}) {
  const [path, query = ''] = to.split('?');
  if (bookingLocked(path)) { askLogin('booking'); return; }   // rezerwacja tylko dla zalogowanych
  const url = BASE + path.replace(/^\//, '') + (query ? '?' + query : '');
  if (replace) history.replaceState(null, '', url); else if (url !== location.pathname + location.search) history.pushState(null, '', url);
  renderRoute(keepScroll);
}
function renderRoute(keepScroll = false) {
  route = currentRoute();
  const [page, title] = ROUTES[route];
  let first = true;
  $$('main [data-page]').forEach((sec) => {
    const show = sec.dataset.page === page; sec.hidden = !show;
    sec.classList.toggle('first', show && first); if (show) first = false;
  });
  document.title = title;
  $$('a[data-link]').forEach((a) => {
    const on = a.getAttribute('href') === route;
    a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (!keepScroll) scrollTo({ top: 0, behavior: 'instant' });
  if (page === 'konto') renderPanel();
  if (page === 'rezerwacja' && B.item && !$('#bDays').childElementCount) onItemChange(true);
  if (page === 'home') findNextFree();
}
addEventListener('popstate', () => renderRoute());
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;           // tylko treści statyczne strony
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const zl = (g) => g === null || g === undefined ? '–' : (g / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: g % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fmt = (iso, o = { dateStyle: 'medium', timeStyle: 'short' }) => iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TZ, ...o }) : '–';
const hm = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const wday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k, s = sessionStorage) { try { return JSON.parse(s.getItem(k)); } catch { return null; } },
  set(k, v, s = sessionStorage) { try { s.setItem(k, JSON.stringify(v)); } catch { /* tryb prywatny */ } },
  del(k, s = sessionStorage) { try { s.removeItem(k); } catch { /* */ } },
};
function toast(kind, text, ms = 6000) {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, h('span', { text }), h('button', { 'aria-label': 'Zamknij', text: '×', onclick: () => t.remove() }));
  $('#toasts').append(t);
  if (ms) setTimeout(() => t.remove(), ms);
}
function banner(target, kind, text) {
  const box = typeof target === 'string' ? $(target) : target;
  box.replaceChildren(text ? h('div', { class: `banner ${kind}`, role: kind === 'err' ? 'alert' : 'status', text }) : '');
}
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.classList.add('loading'); btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), ' ', label || 'Chwileczkę…'); }
  else { btn.disabled = false; btn.classList.remove('loading'); btn.textContent = btn.dataset.label || label || ''; }
}
function download(name, content, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ------------------------------------------------------------------ katalog statyczny (opisy; ceny z bazy) */
const CATS = [
  { id: 'optimization', name: 'Optymalizacja i tuning', tagline: 'Strojenie systemu, BIOS-u i chłodzenia. Każdą zmianę zapisujemy i mierzymy.' },
  { id: 'service', name: 'Serwis i montaż PC', tagline: 'Montaż, regeneracja chłodzenia i naprawy wykonywane warsztatowo.' },
  { id: 'solutions', name: 'Strony WWW i automatyzacja dla firm', tagline: 'Strony internetowe i automatyzacja powtarzalnych zadań w firmie.' },
];
const MODE = { remote: 'Zdalnie (RustDesk)', workshop: 'Warsztat: osobiście lub kurierem', project: 'Zdalnie, projekt', set: 'Odbiór osobisty lub wysyłka' };
const MODE_PILL = { remote: 'Zdalnie', workshop: 'Warsztat', project: 'Projekt', set: 'Zestaw' };
const SVC = {
  'strike-overhaul': { cat: 'optimization', mode: 'workshop', dur: 60, price: 19900, pct: 100, forWho: 'Dla komputerów po 2–3 latach pracy: głośnych, gorących i zakurzonych.', summary: 'Pełny przegląd, czyszczenie i wymiana past oraz padów termicznych.', includes: ['Przegląd i diagnostyka (temperatury, S.M.A.R.T., test RAM)', 'Rozbiórka i dokładne czyszczenie: kurz, filtry, wentylatory', 'Wymiana pasty termoprzewodzącej na CPU', 'Wymiana padów termicznych GPU (materiały wyceniane wg modelu)', 'Test obciążeniowy i raport temperatur przed i po'], note: 'Cena obejmuje robociznę. Pady i pasta premium doliczane po akceptacji wyceny.' },
  'strike-precision-tune': { cat: 'optimization', mode: 'remote', dur: 120, price: 24900, pct: 100, express: true, forWho: 'Dla graczy i twórców, którzy chcą chłodniejszego i cichszego PC bez utraty wydajności.', summary: 'Undervolting CPU/GPU oraz dopracowanie kultury pracy i temperatur.', includes: ['Undervolting CPU (offset / Curve Optimizer) i GPU (krzywa V/F)', 'Dobór krzywych wentylatorów i limitów mocy', 'Redukcja hałasu i throttlingu w obciążeniu', 'Testy stabilności (OCCT, Cinebench, 3DMark)', 'Raport temperatur i hałasu przed i po oraz zapis profili'] },
  'strike-zero-latency': { cat: 'optimization', mode: 'remote', dur: 180, price: 34900, pct: 100, express: true, forWho: 'Dla graczy e-sportowych, którym liczy się każda milisekunda opóźnienia.', summary: 'Optymalizacja systemu, BIOS-u i pamięci RAM pod minimalny input lag.', includes: ['Windows Deep De-bloat: usługi, autostart, czysta instalacja sterowników (DDU)', 'BIOS: XMP/EXPO, Resizable BAR, profil zasilania pod niskie opóźnienia', 'Strojenie RAM w granicach stabilności', 'NVIDIA Reflex / AMD Anti-Lag, tryby wyświetlania i limity FPS', 'Pomiar opóźnień i FPS przed i po'] },
  'strike-custom-assembly': { cat: 'service', mode: 'workshop', dur: 60, price: 19900, pct: 100, forWho: 'Dla osób, które mają części (własne lub powierzone) i chcą profesjonalnego montażu.', summary: 'Montaż z części własnych lub powierzonych wraz z cable management.', includes: ['Weryfikacja kompatybilności części przed montażem', 'Montaż, aktualizacja BIOS i włączenie XMP/EXPO', 'Cable management i przepływ powietrza', 'Instalacja Windows i sterowników (opcjonalnie)', 'Testy stabilności i temperatur przed wydaniem', '3 miesiące gwarancji na montaż'], note: 'Części liczone osobno według wyceny, jeśli to my je zamawiamy.' },
  'strike-thermal-shield': { cat: 'service', mode: 'workshop', dur: 60, price: 29900, pct: 100, forWho: 'Dla komputerów z wysokimi temperaturami, throttlingiem lub głośnym chłodzeniem.', summary: 'Regeneracja układów chłodzenia, delid i ciecz termoprzewodząca.', includes: ['Czyszczenie radiatorów i wentylatorów, kontrola docisku', 'Wymiana pasty lub, po akceptacji, ciekły metal dobrany do radiatora', 'Delid procesora (opcjonalnie, tylko za pisemną zgodą – zabieg nieodwracalny, zwykle oznacza utratę gwarancji producenta)', 'Optymalizacja przepływu powietrza w obudowie', 'Pomiar temperatur w obciążeniu przed i po'], note: 'Delid i ciekły metal wykonujemy tylko po potwierdzeniu zgodności podzespołów.' },
  'strike-revival': { cat: 'service', mode: 'workshop', dur: 60, price: 14900, pct: 100, fromLabel: 'za diagnostykę', forWho: 'Dla sprzętu, który nie startuje, restartuje się, daje artefakty lub został uszkodzony.', summary: 'Zaawansowana diagnostyka i naprawa uszkodzonego sprzętu.', includes: ['Diagnostyka: zasilanie, płyta główna, RAM, GPU, dyski', 'Testy na podzespołach referencyjnych', 'Pisemna diagnoza z kosztorysem naprawy', 'Naprawa po akceptacji kosztorysu', 'Wstępna ocena możliwości odzysku danych'], note: 'Online płacisz tylko diagnostykę. Koszt naprawy poznasz z kosztorysu.' },
  // --- strony WWW (ceny końcowe: działalność nierejestrowana, bez VAT) ---
  'strike-web-start': { cat: 'solutions', group: 'web', mode: 'project', dur: 60, price: 129000, pct: 100, label: 'Wizytówka', term: '5–7 dni roboczych', rev: '2 rundy poprawek', forWho: 'Dla fryzjera, mechanika, gabinetu czy freelancera, który chce być widoczny w Google i na telefonie.', summary: 'Strona-wizytówka na jednej przewijanej stronie.', includes: ['Do 5 sekcji: o firmie, usługi, cennik, galeria, kontakt', 'Projekt w kolorach Twojej marki, wygląd dopracowany na telefonie', 'Formularz kontaktowy, mapa dojazdu, kliknij-i-zadzwoń', 'Podstawowe SEO: tytuły, opisy, mapa strony, Google Search Console', 'Podpięcie domeny i certyfikat SSL'], note: 'Najpierw bezpłatna rozmowa i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu.' },
  'strike-web-landing': { cat: 'solutions', group: 'web', mode: 'project', dur: 60, price: 179000, pct: 100, label: 'Landing page', term: '7–10 dni roboczych', rev: '2 rundy poprawek', forWho: 'Dla jednej usługi, produktu, wydarzenia lub kampanii reklamowej, która ma przynosić zapytania.', summary: 'Strona sprzedażowa nastawiona na jeden cel: telefon, zapis lub zakup.', includes: ['Układ sprzedażowy: nagłówek z korzyścią, oferta, opinie, FAQ, wezwania do działania', 'Formularz zapisu lub zamówienia z powiadomieniem na e-mail', 'Statystyki odwiedzin i mierzenie konwersji (Google Analytics / Meta Pixel)', 'Baner zgód cookies, gdy używasz narzędzi śledzących', 'Optymalizacja szybkości pod reklamy (Core Web Vitals)'], note: 'Najpierw bezpłatna rozmowa i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu.' },
  'strike-web-business': { cat: 'solutions', group: 'web', mode: 'project', dur: 60, price: 299000, pct: 100, label: 'Strona firmowa', popular: true, term: '2–3 tygodnie', rev: '3 rundy poprawek', forWho: 'Dla firm usługowych, które chcą osobnych podstron dla każdej usługi i lepszej pozycji w Google.', summary: 'Strona firmowa do 6 podstron z łatwą edycją treści.', includes: ['Do 6 podstron (np. start, o nas, 3× usługa, kontakt) + polityka prywatności', 'Indywidualny projekt graficzny strony głównej i podstron', 'Prosty panel do edycji tekstów, zdjęć i aktualności', 'SEO na każdą podstronę, dane strukturalne, profil firmy w Google', 'Formularze, mapa, galeria, opinie klientów', 'Instrukcja obsługi i 30 dni wsparcia po starcie'], note: 'Najpierw bezpłatna rozmowa i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu.' },
  'strike-web-pro': { cat: 'solutions', group: 'web', mode: 'project', dur: 60, price: 549000, pct: 100, label: 'Strona rozbudowana', term: '3–5 tygodni', rev: '3 rundy poprawek', forWho: 'Dla firm, które chcą przyjmować rezerwacje lub płatności przez stronę i prowadzić bloga.', summary: 'Rozbudowana strona do 12 podstron z rezerwacjami lub płatnościami online.', includes: ['Do 12 podstron, blog lub aktualności z kategoriami', 'Rezerwacje terminów online z przypomnieniami e-mail', 'Płatności online (Stripe, Przelewy24) albo strefa klienta', 'Druga wersja językowa (teksty dostarczasz lub zlecasz tłumaczenie)', 'Integracje: kalendarz, newsletter, CRM, arkusz Google', 'Testy szybkości i dostępności, 60 dni wsparcia po starcie'], note: 'Najpierw bezpłatna rozmowa i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu.' },
  'strike-web-shop': { cat: 'solutions', group: 'web', mode: 'project', dur: 60, price: 699000, pct: 100, label: 'Sklep internetowy', term: '4–6 tygodni', rev: '3 rundy poprawek', forWho: 'Dla małych sklepów i rękodzieła, które chcą sprzedawać online bez prowizji od marketplace.', summary: 'Sklep internetowy z płatnościami, dostawą i panelem zamówień.', includes: ['Sklep na WooCommerce lub Shopify, dobrany do budżetu i liczby produktów', 'Wprowadzenie do 50 produktów (zdjęcia i opisy od Ciebie)', 'Płatności online (BLIK, karta, przelew) i metody dostawy (InPost, kurier)', 'Regulamin i polityka zwrotów – podpinamy dokumenty dostarczone przez Ciebie', 'Maile transakcyjne, kody rabatowe, podstawowe SEO kategorii i produktów', 'Szkolenie z obsługi zamówień i 60 dni wsparcia po starcie'], note: 'Najpierw bezpłatna rozmowa i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu. Opłaty sklepu (np. abonament Shopify, prowizje płatności) płacisz bezpośrednio dostawcom.' },
  // --- automatyzacje ---
  'strike-auto-start': { cat: 'solutions', group: 'auto', mode: 'project', dur: 60, price: 59000, pct: 100, label: 'Jedna automatyzacja', term: '3–5 dni roboczych', rev: '14 dni poprawek po wdrożeniu', forWho: 'Dla firmy, która codziennie ręcznie przepisuje dane z jednego miejsca w drugie.', summary: 'Jeden automatyczny przepływ łączący 2–3 narzędzia.', includes: ['Przykład: formularz ze strony → arkusz Google → powiadomienie e-mail lub SMS', 'Albo: nowe zamówienie → faktura → wiadomość do klienta', 'Konfiguracja w n8n, Make lub Google Apps Script', 'Testy na prawdziwych danych i obsługa błędów', 'Krótka instrukcja, jak sprawdzić, że wszystko działa'], note: 'Najpierw bezpłatna analiza procesu i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu. Abonamenty narzędzi (jeśli są potrzebne) opłacasz bezpośrednio u dostawcy.' },
  'strike-auto-flow': { cat: 'solutions', group: 'auto', mode: 'project', dur: 60, price: 169000, pct: 100, label: 'Pakiet procesów', popular: true, term: '1–2 tygodnie', rev: '30 dni poprawek po wdrożeniu', forWho: 'Dla firm, które chcą zautomatyzować obsługę klienta od zapytania do płatności.', summary: 'Do 3 powiązanych przepływów z logiką warunkową.', includes: ['Analiza procesu i mapa: co dzieje się ręcznie, co można przejąć', 'Do 3 przepływów, np. zapytanie → oferta → przypomnienie → faktura', 'Warunki i rozgałęzienia (np. inna ścieżka dla firm i osób prywatnych)', 'Automatyczne raporty dzienne lub tygodniowe na e-mail', 'Powiadomienia o błędach i dokumentacja przepływów'], note: 'Najpierw bezpłatna analiza procesu i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu. Abonamenty narzędzi (jeśli są potrzebne) opłacasz bezpośrednio u dostawcy.' },
  'strike-auto-system': { cat: 'solutions', group: 'auto', mode: 'project', dur: 60, price: 399000, pct: 100, label: 'System i integracje', term: '3–5 tygodni', rev: '60 dni poprawek po wdrożeniu', forWho: 'Dla firm, w których dane krążą między sklepem, CRM, magazynem i księgowością.', summary: 'Do 8 przepływów, integracje przez API i panel z raportami.', includes: ['Audyt narzędzi i plan integracji etapami', 'Do 8 przepływów, integracje przez API (sklep, CRM, BaseLinker, fakturowanie)', 'Własny serwer n8n na Twoim koncie (bez opłat za liczbę operacji)', 'Panel lub arkusz z raportami i wskaźnikami', 'Monitoring, kopie zapasowe przepływów i szkolenie zespołu'], note: 'Najpierw bezpłatna analiza procesu i wycena na piśmie. Płatność 100% z góry, po akceptacji zakresu. Abonamenty narzędzi (jeśli są potrzebne) opłacasz bezpośrednio u dostawcy.' },
};
/* Zestawy PC – treści 1:1 z catalog.json / realizacje.html (ceny i dopłaty w groszach; bazę cen i tak liczy serwer) */
/* Zestawy poglądowe – części i ceny z list x-kom użytkownika (stan cen: 26.10.2026).
   light l79zudvlk · value r7mxcru54 · pulse ymat5gyun · venom l96rdhr7d · beast zy89qs2zl */
const PRICES_AT = '26.10.2026';
const SOL_GROUPS = [
  { id: 'web', name: 'Strony internetowe', tagline: 'Od wizytówki po sklep. Każda strona jest szybka, działa na telefonie i należy do Ciebie: domena i hosting są na Twoim koncie.' },
  { id: 'auto', name: 'Automatyzacje', tagline: 'Łączymy narzędzia, których już używasz, żeby powtarzalne zadania działy się same.' },
];
let SOL_ADDONS = [
  ['Dodatkowa podstrona', 'od 190 zł'],
  ['Dodatkowa runda poprawek', '150 zł'],
  ['Dodatkowa wersja językowa', 'od 390 zł'],
  ['Kolejny przepływ automatyzacji', 'od 390 zł'],
  ['Przeniesienie lub odświeżenie istniejącej strony', 'od 690 zł'],
  ['Opieka techniczna: aktualizacje, kopie zapasowe, drobne zmiany do 1 h', '99 zł / mies.'],
  ['Monitoring automatyzacji i poprawki po zmianach w narzędziach', '79 zł / mies.'],
  ['Domena i hosting – zawsze na Twoim koncie', 'wg cennika dostawcy'],
];
const QUOTE_TEXT = {
  web: (n) => `Dzień dobry, interesuje mnie pakiet ${n}.\nFirma / branża: \nCo ma robić strona (telefony, zapisy, sprzedaż): \nMam już: domenę / logo / teksty / zdjęcia: \nPrzykładowe strony, które mi się podobają: \nTermin: `,
  auto: (n) => `Dzień dobry, interesuje mnie pakiet ${n}.\nJakich narzędzi używamy (np. arkusz, CRM, sklep, fakturowanie): \nCo dziś robimy ręcznie: \nJak często (dziennie / tygodniowo): \nTermin: `,
};
/** Projekty (strony, automatyzacje): najpierw wycena – formularz kontaktowy z wybranym pakietem. */
function askQuote(id) {
  const s = svcOf(id), d = SVC[id] || {};
  if (!s) return;
  navigate('/kontakt');
  const sel = $('#cTopic'); if (sel) { if (![...sel.options].some((o) => o.text === s.name)) sel.append(h('option', { text: s.name })); sel.value = s.name; }
  const msg = $('#cMsg'); if (msg && (!msg.value.trim() || msg.dataset.quote)) { msg.value = (QUOTE_TEXT[d.group] || QUOTE_TEXT.web)(s.name); msg.dataset.quote = '1'; }
  setTimeout(() => { $('#cName')?.focus(); }, 60);
}
const ASSEMBLY_GROSZE = 19900;   // STRIKE Custom Assembly – złożenie i testy (od)
const SETS = [
 {
  "id": "strike-light",
  "num": "01",
  "name": "STRIKE Light",
  "badge": "Start 1080p",
  "kicker": "Tani PC / 1080p",
  "desc": "Przystępny zestaw do gier e-sportowych i grania w 1080p.",
  "parts": [
   [
    "CPU",
    "AMD Ryzen 5 5600"
   ],
   [
    "GPU",
    "INNO3D GeForce RTX 5060 Twin X2 8 GB"
   ],
   [
    "RAM",
    "G.Skill Ripjaws V 16 GB (2×8 GB) DDR4-3600 CL18"
   ],
   [
    "Dysk",
    "Lexar NM620 1 TB NVMe"
   ],
   [
    "Płyta",
    "Gigabyte B550 Gaming X V2"
   ],
   [
    "Zasilacz",
    "Endorfy Vero L6 550 W 80+ Bronze"
   ],
   [
    "Chłodzenie",
    "Thermalright Assassin X 120 Refined SE"
   ],
   [
    "Obudowa",
    "Deepcool CC560 ARGB"
   ]
  ],
  "parts_grosze": 552400
 },
 {
  "id": "strike-value-champion",
  "num": "02",
  "name": "STRIKE Value Champion",
  "badge": "AM5",
  "kicker": "Platforma z możliwością rozbudowy",
  "ribbon": "Nasz wybór",
  "featured": true,
  "desc": "Zestaw na platformie AM5, którą łatwo rozbudować w przyszłości.",
  "parts": [
   [
    "CPU",
    "AMD Ryzen 5 7500F"
   ],
   [
    "GPU",
    "Gigabyte Radeon RX 9070 GRE Gaming OC 12 GB"
   ],
   [
    "RAM",
    "Goodram IRDM 16 GB (1×16 GB) DDR5-6000 CL30"
   ],
   [
    "Dysk",
    "Kingston KC3000 1 TB NVMe PCIe 4.0"
   ],
   [
    "Płyta",
    "ASRock B650M-H/M.2+"
   ],
   [
    "Zasilacz",
    "SMX Okame G3 650 W 80+ Gold, ATX 3.1"
   ],
   [
    "Chłodzenie",
    "Endorfy Fera 5 120 mm"
   ],
   [
    "Obudowa",
    "SMX Coffer"
   ]
  ],
  "parts_grosze": 689200
 },
 {
  "id": "strike-pulse",
  "num": "03",
  "name": "STRIKE Pulse",
  "badge": "1440p i cisza",
  "kicker": "E-sport i cicha praca",
  "desc": "Do gier w 1440p i e-sportu, z naciskiem na cichą pracę.",
  "parts": [
   [
    "CPU",
    "AMD Ryzen 7 7700"
   ],
   [
    "GPU",
    "ASRock Radeon RX 9060 XT Challenger OC 16 GB"
   ],
   [
    "RAM",
    "Goodram IRDM 32 GB (2×16 GB) DDR5-6400 CL32"
   ],
   [
    "Dysk",
    "Kingston KC3000 1 TB NVMe PCIe 4.0"
   ],
   [
    "Płyta",
    "ASRock B650M-H/M.2+"
   ],
   [
    "Zasilacz",
    "be quiet! Pure Power 12 750 W 80+ Gold"
   ],
   [
    "Chłodzenie",
    "Endorfy Fera 5 120 mm"
   ],
   [
    "Obudowa",
    "SMX Coffer"
   ]
  ],
  "parts_grosze": 801200
 },
 {
  "id": "strike-venom",
  "num": "04",
  "name": "STRIKE Venom",
  "badge": "E-sport turniejowy",
  "kicker": "Do gier e-sportowych",
  "desc": "Zestaw z procesorem 3D V-Cache do gier e-sportowych na monitorach o wysokim odświeżaniu.",
  "parts": [
   [
    "CPU",
    "AMD Ryzen 7 7800X3D"
   ],
   [
    "GPU",
    "Gigabyte Radeon RX 9070 XT Gaming OC 16 GB"
   ],
   [
    "RAM",
    "Goodram IRDM 32 GB (2×16 GB) DDR5-6400 CL32"
   ],
   [
    "Dysk",
    "Kingston NV3 1 TB NVMe PCIe 4.0"
   ],
   [
    "Płyta",
    "ASUS B650E MAX Gaming WiFi"
   ],
   [
    "Zasilacz",
    "be quiet! Pure Power 12 850 W 80+ Gold"
   ],
   [
    "Chłodzenie",
    "Endorfy Navis F360 ARGB (AIO 360 mm)"
   ],
   [
    "Obudowa",
    "Thermalright A70 FAN"
   ]
  ],
  "parts_grosze": 1042200
 },
 {
  "id": "strike-esport-beast",
  "num": "05",
  "name": "STRIKE eSport Beast",
  "badge": "4K i e-sport",
  "kicker": "Najmocniejszy w ofercie",
  "ribbon": "Najmocniejszy",
  "desc": "Najmocniejsza konfiguracja w naszej ofercie – do gier w 4K i e-sportu.",
  "parts": [
   [
    "CPU",
    "AMD Ryzen 7 9800X3D"
   ],
   [
    "GPU",
    "Gainward GeForce RTX 5080 Phoenix V1 16 GB"
   ],
   [
    "RAM",
    "Goodram IRDM 32 GB (2×16 GB) DDR5-6400 CL32"
   ],
   [
    "Dysk",
    "Kingston KC3000 2 TB NVMe PCIe 4.0"
   ],
   [
    "Płyta",
    "Gigabyte B650 Gaming X AX V2"
   ],
   [
    "Zasilacz",
    "be quiet! Pure Power 13 M 1000 W 80+ Gold"
   ],
   [
    "Chłodzenie",
    "Endorfy Navis F360 (AIO 360 mm)"
   ],
   [
    "Obudowa",
    "Endorfy Signum 300 Air"
   ]
  ],
  "parts_grosze": 1613200
 }
];
const FORGE = { id: 'strike-forge', num: '06', name: 'STRIKE Forge', badge: 'Stacja robocza', kicker: 'Do pracy twórczej',
  desc: 'Stacja robocza do renderowania 3D, montażu wideo i obliczeń na GPU – konfigurowana pod Twoje programy.', priceFrom: 1350000,
  parts: [['CPU', 'AMD Ryzen 9 9950X'], ['GPU', 'NVIDIA GeForce RTX 5080 16 GB lub RTX 5090 32 GB'], ['RAM', '64–128 GB DDR5'], ['Dysk', '1 TB PCIe Gen5 + 4 TB PCIe Gen4']] };
const SET_NOTE = `Zestawy są poglądowe – pokazują, co zwykle mieści się w danym budżecie. Ostateczny dobór części ustalamy po rozmowie z Tobą, a ceny sprawdzamy w dniu wyceny (podane: x-kom, ${PRICES_AT}). Wartość części nie obejmuje złożenia i testów (od 199 zł), systemu operacyjnego, monitora ani peryferiów. Zamówienie: płatność 100% z góry po akceptacji wyceny. Ceny końcowe (bez VAT).`;
const isHiddenService = (s) => s.id === 'strike-ai-local-deploy' || /\bAI\b/.test(s.name || '');

const STATUS = {
  OCZEKUJE_NA_PLATNOSC: ['Czeka na płatność', 'wait'], OPLACONE: ['Opłacone – przyjęte', 'ok'], W_REALIZACJI: ['W realizacji', 'ok'],
  TESTY: ['Testy i raport', 'ok'], ZAKONCZONE: ['Zakończone', 'ok'], ANULOWANE: ['Anulowane', 'bad'],
};
const SLOT_STATUS = { TRZYMANA: 'Termin czeka na płatność', ZAKONCZONA_REZERWACJA: 'Termin potwierdzony', ANULOWANA: 'Termin zwolniony', ZABLOKOWANA: 'Blokada' };
const REF_STATUS = { OCZEKUJE: ['Czeka na płatność', 'wait'], POTWIERDZONE: ['Potwierdzone', 'ok'], WYPLACONA: ['Nagroda wydana', 'ok'], ODRZUCONE: ['Odrzucone', 'bad'] };
const CODE_MSG = {
  LOGIN_REQUIRED: 'Zaloguj się, aby użyć kodu rabatowego.', REFERRAL_SELF: 'Nie możesz użyć własnego kodu polecającego.',
  REFERRAL_NOT_NEW_CUSTOMER: 'Rabat z polecenia przysługuje tylko nowym klientom.', REFERRAL_ALREADY_USED: 'Kod polecający został już użyty na tym koncie.',
  REFERRAL_INVALID: 'Nieprawidłowy kod.', CODE_INVALID: 'Nieprawidłowy lub nieaktywny kod rabatowy.', CODE_EXPIRED: 'Kod rabatowy wygasł.',
  CODE_NOT_YOURS: 'Ten kod jest przypisany do innego konta.', CODE_USED_UP: 'Ten kod został już wykorzystany.', CODE_SERVICES_ONLY: 'Ten kod dotyczy tylko usług, nie zestawów PC.',
  EXPRESS_NOT_AVAILABLE: 'Express nie jest dostępny dla tej pozycji.', OPTION_INVALID: 'Ta konfiguracja jest niedostępna. Odśwież stronę.', SERVICE_NOT_FOUND: 'Ta pozycja jest niedostępna.',
};

/* ------------------------------------------------------------------ stan */
let sb = null;
let session = null, profile = null, isAdmin = false;
const cat = { live: false, services: new Map(), options: new Map(), info: new Map(), hasV2: true };
const conn = { state: 'init', ping: null, hist: [], realtime: false, fails: 0, timer: null, wasDown: false, configured: false };

/* ------------------------------------------------------------------ połączenie z serwerem */
function resolveConfig() {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const placeholder = (v) => !v || /TWOJ_|WKLEJ_/.test(v);
  if (!placeholder(CFG.SUPABASE_URL) && !placeholder(CFG.SUPABASE_KEY)) return { url: CFG.SUPABASE_URL, key: CFG.SUPABASE_KEY };
  if (local && CFG.DEV_SUPABASE_KEY) return { url: CFG.DEV_SUPABASE_URL, key: CFG.DEV_SUPABASE_KEY };
  return null;
}
function log(text) {
  const box = $('#cLog'); if (!box) return;
  box.prepend(h('span', { text: `${new Date().toLocaleTimeString('pl-PL', { timeZone: TZ })} ${text}` }));
  while (box.children.length > 5) box.lastChild.remove();
}
function setConn(state, info) {
  const prev = conn.state; conn.state = state;
  const map = {
    online: ['ok', 'Online', 'ONLINE', 'ok', 'Serwery online'],
    slow: ['wait', 'Wolne łącze', 'DEGRADED', 'wait', 'Serwery online · wolne łącze'],
    connecting: ['wait', 'Łączenie…', 'ŁĄCZENIE', 'wait', 'Łączenie z serwerami…'],
    offline: ['bad', 'Serwery niedostępne', 'OFFLINE', 'bad', 'Serwery chwilowo niedostępne'],
    config: ['bad', 'Tryb katalogu', 'BRAK KONFIGURACJI', 'bad', 'Rezerwacje online wyłączone (brak konfiguracji)'],
  }[state];
  $('#connDot').className = `dot ${map[0]}`; $('#connTxt').textContent = map[1];
  $('#connChip').title = info || map[4];
  $('#liveDot').className = `dot ${map[0]}`; $('#liveTxt').textContent = map[4];
  $('#liveBadge').className = `live-badge ${map[0] === 'ok' ? 'ok' : map[0] === 'bad' ? 'bad' : ''}`;
  const cs = $('#cStatus'); if (cs) { cs.textContent = map[2]; cs.className = map[3]; }
  const bar = $('#offlineBar');
  if (state === 'offline') { bar.textContent = info || 'Kalendarz rezerwacji jest chwilowo niedostępny. Spróbujemy ponownie automatycznie – możesz też napisać do nas.'; bar.classList.remove('hidden'); }
  else bar.classList.add('hidden');
  if (prev !== state) log(`status: ${map[2]}`);
}
function renderConsole() {
  if (!$('#cPing')) return;   // panel diagnostyczny usunięty ze strony głównej (v9)
  $('#cPing').textContent = conn.ping === null ? '–' : `${conn.ping} ms`;
  $('#cPing').className = conn.ping === null ? '' : conn.ping < 400 ? 'ok' : conn.ping < 1500 ? 'wait' : 'bad';
  const spark = $('#cSpark'); spark.replaceChildren(...conn.hist.slice(-28).map((p) => h('i', { class: p < 0 ? 'fail' : '', style: `height:${p < 0 ? 100 : Math.max(8, Math.min(100, p / 8))}%` })));
  $('#cItems').textContent = cat.services.size ? `${[...cat.services.values()].filter((s) => s.kind === 'USLUGA').length} usług · ${SETS.length + 1} zestawów poglądowych` : '–';
  const rt = $('#cRealtime');
  rt.textContent = !session ? 'po zalogowaniu' : conn.realtime ? 'AKTYWNE' : 'odświeżanie co 60 s';
  rt.className = session && conn.realtime ? 'ok' : '';
}
async function heartbeat() {
  clearTimeout(conn.timer);
  if (!sb) return;
  if (!navigator.onLine) { setConn('offline', 'Brak internetu na tym urządzeniu. Rezerwacja wróci, gdy połączenie się przywróci.'); conn.hist.push(-1); renderConsole(); return schedule(10000); }
  const t0 = performance.now();
  let ok = false;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000);
    const { error } = await sb.from('services').select('id', { head: true, count: 'exact' }).limit(1).abortSignal(ctl.signal);
    clearTimeout(to);
    ok = !error;
    if (error) log(`ping błąd: ${error.message}`);
  } catch (e) { log(`ping: ${e.message}`); }
  const ms = Math.round(performance.now() - t0);
  if (ok) {
    conn.ping = ms; conn.hist.push(ms); conn.fails = 0;
    setConn(ms > 2500 ? 'slow' : 'online');
    if (conn.wasDown) { conn.wasDown = false; log('połączenie przywrócone – synchronizuję'); toast('ok', 'Połączenie przywrócone. Dane są aktualne.'); resync(); }
    schedule(CFG.HEARTBEAT_MS);
  } else {
    conn.fails++; conn.hist.push(-1); conn.ping = null; conn.wasDown = true;
    const wait = [3, 6, 12, 24, 45][Math.min(conn.fails - 1, 4)] * 1000;
    setConn('offline');
    schedule(wait);
  }
  renderConsole();
}
function schedule(ms) { clearTimeout(conn.timer); conn.timer = setTimeout(heartbeat, ms); }
async function resync() {
  await loadCatalog();
  if (B.day) loadSlots(true);
  if (session) { await loadProfile(); loadPanelData(); subscribeRealtime(); }
  findNextFree();
}
addEventListener('online', () => { log('internet wrócił'); heartbeat(); });
addEventListener('offline', () => { conn.wasDown = true; setConn('offline', 'Brak internetu na tym urządzeniu. Rezerwacja wróci, gdy połączenie się przywróci.'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sb) { heartbeat(); if (B.day) loadSlots(true); if (session) loadPanelData(); }
});

async function callFn(name, body) {
  if (!sb) throw Object.assign(new Error('Rezerwacje online są chwilowo niedostępne.'), { code: 'NO_BACKEND' });
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let p = {};
    try { p = await error.context.json(); } catch { /* brak treści */ }
    const offline = error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError';
    if (offline) { conn.wasDown = true; heartbeat(); }
    throw Object.assign(new Error(p.error || (offline ? 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.' : 'Błąd serwera. Spróbuj ponownie.')), { code: p.code, fields: p.fields, status: error.context?.status });
  }
  return data;
}

/* ------------------------------------------------------------------ katalog i ceny */
function staticCatalog() {
  cat.services.clear(); cat.options.clear();
  for (const [id, s] of Object.entries(SVC)) cat.services.set(id, { id, kind: 'USLUGA', category: s.cat, name: nameOf(id), price_grosze: s.price, payment_percent: s.pct, duration_min: s.dur, mode: s.mode, express_eligible: !!s.express });
}
function nameOf(id) { return 'STRIKE ' + id.replace(/^strike-/, '').split('-').map((w) => w === 'esport' ? 'eSport' : w[0].toUpperCase() + w.slice(1)).join(' ').replace('Zero Latency', 'Zero-Latency'); }
async function loadCatalog() {
  if (!sb) { staticCatalog(); renderCatalog(); return; }
  let s = await sb.from('services').select('id,kind,category,name,price_grosze,payment_percent,duration_min,mode,express_eligible,sort').eq('active', true).order('sort');
  if (s.error && /column/.test(s.error.message)) {   // baza bez migracji v2
    cat.hasV2 = false; log('baza bez migracji v2 – tryb zgodności');
    s = await sb.from('services').select('id,kind,category,name,price_grosze,payment_percent,duration_min').eq('active', true).order('price_grosze');
  }
  if (s.error) { log(`katalog: ${s.error.message}`); if (!cat.services.size) { staticCatalog(); renderCatalog(); } return; }
  if (!s.data.length) { log('katalog w bazie jest pusty – uruchom seed.sql'); staticCatalog(); cat.live = false; renderCatalog(); return; }
  const [o, p] = cat.hasV2 ? await Promise.all([sb.from('service_options').select('service_id,grp,id,label,delta_grosze,sort,hint').order('sort'), sb.rpc('get_price_info')]) : [{ data: [] }, { data: [] }];
  cat.services.clear(); cat.options.clear(); cat.info.clear();
  for (const row of s.data) {
    if (isHiddenService(row) || row.kind === 'ZESTAW_PC') continue;   // zestawy są poglądowe (migracja v3)
    const st = SVC[row.id];
    cat.services.set(row.id, { ...row, mode: row.mode || st?.mode || (row.kind === 'ZESTAW_PC' ? 'set' : 'remote'), express_eligible: row.express_eligible ?? !!st?.express, name: row.name.replace(/\s*\(diagnostyka\)\s*$/, '') });
  }
  for (const row of o.data || []) {
    const m = cat.options.get(row.service_id) || {}; (m[row.grp] ||= []).push(row); cat.options.set(row.service_id, m);
  }
  for (const r of p.data || []) cat.info.set(r.service_id, r);
  cat.live = true;
  if (cat.hasV2) { const a = await sb.from('price_addons').select('label,price_text').order('sort'); if (!a.error && a.data?.length) SOL_ADDONS = a.data.map((x) => [x.label, x.price_text]); }   // „Dodatki i opieka” z panelu Cennik (v23)
  renderCatalog();
}
function payText(s) { return s.payment_percent < 100 ? `Zaliczka ${s.payment_percent}% online, reszta ${s.kind === 'ZESTAW_PC' ? 'przy odbiorze' : 'wg etapów'}` : 'Płatność online z góry'; }
function priceBlock(s, label) {
  const info = cat.info.get(s.id);
  return h('div', { class: 'price' },
    h('small', { text: label || 'Cena' }),
    h('b', { text: `Od ${zl(s.price_grosze)}${SVC[s.id]?.fromLabel ? ' ' + SVC[s.id].fromLabel : ''}` }),
    info?.reduction && info.lowest30_grosze ? h('span', { class: 'omni', text: `Najniższa cena z 30 dni przed obniżką: ${zl(info.lowest30_grosze)}` }) : null,
    h('span', { text: s.mode === 'project' ? 'Cena końcowa, bez VAT · płatność z góry po akceptacji wyceny' : `${MODE[s.mode] || ''} · ${payText(s)}` }),
    !cat.live ? h('span', { class: 'stale', text: 'Cena orientacyjna – aktualną pokaże formularz po połączeniu.' }) : null);
}
let activeCat = new URLSearchParams(location.search).get('kategoria') || 'optimization';
function showCat(id) {
  activeCat = id;
  $$('#svcCats .cat-tab').forEach((b) => { const on = b.dataset.cat === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  $$('#svcCats .cat').forEach((p) => { p.hidden = p.id !== `kat-${id}`; });
}
function renderCatalog() {
  const box = $('#svcCats'); box.replaceChildren();
  const inCat = (c) => [...cat.services.values()].filter((s) => s.kind === 'USLUGA' && (s.category === c.id || (!s.category && SVC[s.id]?.cat === c.id)));
  const cats = CATS.filter((c) => inCat(c).length);
  if (!cats.some((c) => c.id === activeCat)) activeCat = cats[0]?.id;
  const tabs = h('div', { class: 'cat-tabs', role: 'tablist', 'aria-label': 'Kategorie usług' }, cats.map((c) =>
    h('button', { type: 'button', role: 'tab', class: 'cat-tab', id: `cattab-${c.id}`, 'aria-controls': `kat-${c.id}`, tabindex: c.id === activeCat ? '0' : '-1', 'data-cat': c.id, 'aria-selected': String(c.id === activeCat), text: c.name, onclick: () => showCat(c.id) })));
  box.append(tabs);
  for (const c of cats) {
    const list = inCat(c);
    box.append(h('div', { class: 'cat', id: `kat-${c.id}`, role: 'tabpanel', 'aria-labelledby': `cattab-${c.id}`, hidden: c.id !== activeCat },
      h('div', { class: 'cat-head' }, h('h3', { text: c.name }), h('p', { text: c.tagline })),
      ...(c.id === 'solutions' ? solBlocks(list) : [h('div', { class: 'grid g3' }, list.map(svcCard))])));
  }
  renderSets(); renderItemSelect(); renderContactTopics(); renderConsole(); renderTiles(); initAdvisor();
}
function svcCard(s) {
  const d = SVC[s.id] || {}, proj = s.mode === 'project', cta = proj ? 'Zapytaj o wycenę' : 'Zarezerwuj termin';
  return h('article', { class: `card hud svc${d.popular ? ' svc-pop' : ''}`, id: s.id },
    h('div', { class: 'svc-top' }, h('span', { class: 'pill', text: proj ? (d.label || MODE_PILL.project) : (MODE_PILL[s.mode] || 'Usługa') }), s.express_eligible ? h('span', { class: 'pill ghost', text: 'Express' }) : null, d.popular ? h('span', { class: 'pill ghost pop', text: 'Najczęściej wybierany' }) : null, proj ? null : h('span', { class: 'pill ghost', text: `${s.duration_min / 60} h` })),
    h('h4', { text: s.name }),
    d.forWho ? h('p', { class: 'svc-for', text: d.forWho }) : null,
    d.summary ? h('p', { class: 'svc-sum', text: d.summary }) : null,
    proj && (d.term || d.rev) ? h('dl', { class: 'svc-facts' }, d.term ? [h('dt', { text: 'Realizacja' }), h('dd', { text: d.term })] : null, d.rev ? [h('dt', { text: 'Poprawki' }), h('dd', { text: d.rev })] : null) : null,
    d.includes ? h('ul', { class: 'check-list' }, d.includes.map((t) => h('li', { text: t }))) : h('div', { style: 'flex:1' }),
    d.note ? h('p', { class: 'note', text: d.note }) : null,
    h('div', { class: 'svc-foot' }, priceBlock(s, proj ? 'Cena pakietu' : undefined), h('button', { class: 'btn btn-gold btn-block', type: 'button', text: cta, 'aria-label': `${cta}: ${s.name}`, onclick: () => (proj ? askQuote(s.id) : pickItem(s.id)) })));
}
/** Zakładka stron i automatyzacji: dwie grupy pakietów + dodatki. */
function solBlocks(list) {
  const out = [];
  for (const g of SOL_GROUPS) {
    const items = list.filter((s) => (SVC[s.id]?.group || 'web') === g.id);
    if (!items.length) continue;
    out.push(h('div', { class: 'sol-group' }, h('div', { class: 'sol-head' }, h('h4', { text: g.name }), h('p', { class: 'muted', text: g.tagline })),
      h('div', { class: 'grid g3' }, items.map(svcCard))));
  }
  out.push(h('div', { class: 'card hud sol-addons' },
    h('div', { class: 'sol-head' }, h('h4', { text: 'Dodatki i opieka' }), h('p', { class: 'muted', text: 'Ceny końcowe – nie doliczamy VAT. Zakres i cenę potwierdzamy na piśmie przed startem, a każda zmiana zakresu to osobna, wcześniej podana kwota.' })),
    h('ul', { class: 'addon-list' }, SOL_ADDONS.map(([t, p]) => h('li', {}, h('span', { text: t }), h('b', { text: p })))),
    h('div', { class: 'sol-cta' }, h('span', { text: 'Nie wiesz, który pakiet wybrać?' }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-consult': '', text: 'Bezpłatna konsultacja – 15 min' }))));
  return out;
}
function renderTiles() {
  $$('[data-from]').forEach((el) => {
    const c = el.dataset.from;
    const prices = c === 'pc' ? SETS.map((m) => m.parts_grosze) : [...cat.services.values()].filter((s) => s.kind === 'USLUGA' && (s.category || SVC[s.id]?.cat) === c).map((s) => s.price_grosze);
    if (prices.length) el.textContent = `od ${zl(Math.min(...prices))}`;
  });
}
/* ------------------------------------------------------------------ media: zdjęcia i filmy z folderu media/ (lista w media/media.json) */
const MEDIA = { data: null };
async function loadMedia() {
  try { const r = await fetch(BASE + 'media/media.json', { cache: 'no-cache' }); if (r.ok) MEDIA.data = await r.json(); } catch { /* brak pliku: zostają miejsca zastępcze */ }
  applyMedia(); setBenchVideo($('#game')?.value || 'cs2');
}
const mediaUrl = (f) => /^https?:\/\//.test(f) ? f : BASE + 'media/' + String(f).replace(/^\/+/, '');
const isVideo = (f) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(f);
function mediaGet(path) { return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), MEDIA.data); }
function mediaEl(file, alt = '', poster = '') {
  if (isVideo(file)) {
    const v = h('video', { src: mediaUrl(file), loop: true, playsinline: true, preload: 'metadata', poster: poster ? mediaUrl(poster) : null, 'aria-label': alt || null });
    v.muted = true; v.autoplay = !reduceMotion(); v.setAttribute('muted', '');
    v.addEventListener('error', () => v.replaceWith(mediaPlaceholder()));
    if (!reduceMotion()) v.addEventListener('loadeddata', () => v.play().catch(() => {}), { once: true });
    return v;
  }
  const img = h('img', { src: mediaUrl(file), alt, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(mediaPlaceholder()));
  return img;
}
const PC_SVG = '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="30" y="12" width="60" height="96" rx="6"/><rect x="38" y="20" width="44" height="6" rx="2"/><g class="fan"><circle cx="60" cy="52" r="15"/><path d="M60 52 60 39M60 52l11 7M60 52l-11 7"/></g><g class="fan"><circle cx="60" cy="86" r="13"/><path d="M60 86V75M60 86l9 6M60 86l-9 6"/></g></svg>';
function mediaPlaceholder() { return h('div', { class: 'media-ph', html: PC_SVG }); }
/** Wypełnia wszystkie [data-media] (jeden plik) i [data-media-list] (galeria). */
function applyMedia(root = document) {
  $$('[data-media]', root).forEach((fig) => {
    const f = mediaGet(fig.dataset.media);
    const key = f || '';
    if (fig.dataset.loaded === key && fig.firstChild) return;
    fig.dataset.loaded = key;
    fig.replaceChildren(...(f ? [mediaEl(f, fig.dataset.alt || '')] : 'optional' in fig.dataset ? [] : [mediaPlaceholder()]));
    fig.classList.toggle('has-media', !!f);
  });
  $$('[data-media-list]', root).forEach((box) => {
    const list = (mediaGet(box.dataset.mediaList) || []).filter((x) => x && (x.plik || typeof x === 'string'));
    // dopóki plików jest mało, resztę paska wypełniają animowane miejsca zastępcze
    // miejsca zastępcze tylko na localhost, gdy nie ma jeszcze żadnego pliku; na żywej stronie pusta galeria się chowa
    const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const items = list.length ? list : dev ? Array.from({ length: +box.dataset.placeholders || 4 }, () => null) : [];
    box.closest('section')?.classList.toggle('hidden', !items.length);
    const key = JSON.stringify(list);
    if (box.dataset.loaded === key && box.firstChild) return;
    box.dataset.loaded = key;
    box.replaceChildren(...items.map((x) => {
      const file = typeof x === 'string' ? x : x?.plik, label = typeof x === 'string' ? '' : x?.opis || '';
      const fig = h('figure', { class: `media gal-item${file ? ' has-media' : ''}${x?.pion ? ' portrait' : ''}` }, file ? mediaEl(file, label, x?.poster) : mediaPlaceholder(), label ? h('figcaption', { text: label }) : null);
      markOrientation(fig);
      return fig;
    }));
    box.dataset.real = String(list.length);
    if (box.classList.contains('gal-track')) requestAnimationFrame(() => setupLoop(box));
  });
}
/** Pasek galerii przewija się w kółko tylko, gdy ma min. 3 własne pliki i nie mieści się na ekranie.
    Wtedy dokleja ukrytą dla czytników kopię kafelków (bez niej byłaby przerwa w pętli). */
const LOOP_MIN = 3;
function setupLoop(box) {
  box.querySelectorAll('[data-clone]').forEach((n) => n.remove());
  box.classList.remove('loop');
  if (reduceMotion() || +box.dataset.real < LOOP_MIN) return;
  if (box.scrollWidth <= box.parentElement.clientWidth) return;
  [...box.children].forEach((n) => {
    const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.dataset.clone = '1';
    c.querySelectorAll('video').forEach((v) => { v.muted = true; v.autoplay = true; v.addEventListener('loadeddata', () => v.play().catch(() => {}), { once: true }); });
    box.append(c);
  });
  box.classList.add('loop');
}
const relayoutGallery = debounce(() => $$('.gal-track').forEach(setupLoop), 250);
addEventListener('resize', relayoutGallery);
/** Pionowe zdjęcie/film (np. z telefonu) dostaje węższy kafelek o tej samej wysokości. */
function markOrientation(fig) {
  const m = fig.querySelector('video, img'); if (!m) return;
  const set = (w, hh) => { if (w && hh) { fig.classList.toggle('portrait', hh > w); if (fig.closest('.gal-track')) relayoutGallery(); } };
  if (m.tagName === 'VIDEO') m.addEventListener('loadedmetadata', () => set(m.videoWidth, m.videoHeight), { once: true });
  else m.addEventListener('load', () => set(m.naturalWidth, m.naturalHeight), { once: true });
}
const reduceMotion = () => document.documentElement.classList.contains('paused') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/* WCAG 2.2.2: przycisk „Zatrzymaj animacje” w stopce (wybór zapamiętany w przeglądarce) */
function setMotion(paused, save = true) {
  document.documentElement.classList.toggle('paused', paused);
  const b = document.getElementById('motionBtn');
  if (b) { b.setAttribute('aria-pressed', String(paused)); b.textContent = paused ? 'Włącz animacje' : 'Zatrzymaj animacje'; }
  document.querySelectorAll('video').forEach((v) => { if (paused) v.pause(); else if (v.autoplay || v.closest('.gal-track, .hero-media')) v.play().catch(() => {}); });
  if (typeof Scene !== 'undefined') { if (paused) { Scene.running = false; Scene.vid?.pause(); } }
  document.querySelectorAll('.gal-track').forEach((t) => { try { setupLoop(t); } catch { /* */ } });
  if (save) { try { localStorage.setItem('stl_motion', paused ? 'off' : 'on'); } catch { /* */ } }
}
document.addEventListener('click', (e) => { if (e.target.closest?.('#motionBtn')) setMotion(!document.documentElement.classList.contains('paused')); });
try { if (localStorage.getItem('stl_motion') === 'off') document.documentElement.classList.add('paused'); } catch { /* */ }

/* ------------------------------------------------------------------ zestawy poglądowe */
const setTotal = (m) => m.parts_grosze + ASSEMBLY_GROSZE;
function partsList(parts, main = 4) {
  const row = ([k, v]) => h('div', { class: 'spec-row' }, h('dt', { text: k }), h('dd', { text: v }));
  const top = h('dl', { class: 'spec-list' }, parts.slice(0, main).map(row));
  if (parts.length <= main) return [top];
  return [top, h('details', { class: 'parts-more' }, h('summary', { text: `Pełna lista części (${parts.length})` }), h('dl', { class: 'spec-list' }, parts.slice(main).map(row)))];
}
function renderSets() {
  const grid = $('#setsGrid'); if (!grid) return;
  const card = (m, price, btn) => h('article', { class: `card hud set${m.featured ? ' featured' : ''}`, id: m.id },
    m.ribbon ? h('span', { class: 'ribbon', text: m.ribbon }) : null,
    h('figure', { class: 'media set-media', dataset: { media: `zestawy.${m.id}`, alt: `Ilustracja poglądowa komputera ${m.name}` } }),
    h('div', { class: 'set-top' }, h('span', { class: 'set-num', text: m.num }), h('span', { class: 'pill', text: m.badge })),
    h('h3', { class: 'set-name', text: m.name }), h('span', { class: 'set-kicker', text: m.kicker }), h('p', { class: 'set-desc', text: m.desc }),
    ...partsList(m.parts), price, btn);
  grid.replaceChildren(
    ...SETS.map((m) => card(m,
      h('div', { class: 'set-price' }, h('small', { text: 'Wartość części' }), h('b', { text: zl(m.parts_grosze) }), h('span', { text: `+ złożenie i testy od ${zl(ASSEMBLY_GROSZE)}` })),
      h('button', { class: `btn ${m.featured || m.ribbon ? 'btn-gold' : 'btn-ghost'} btn-block`, type: 'button', text: 'Chcę podobny – wyceń', 'aria-label': `Chcę podobny – wyceń: ${m.name}`, onclick: () => pcRequest({ budget: Math.ceil(setTotal(m) / 25000) * 250, inspiration: m.name }) }))),
    card(FORGE,
      h('div', { class: 'set-price' }, h('small', { text: 'Cena' }), h('b', { class: 'custom', text: 'Wycena indywidualna' }), h('span', { text: `od ~${zl(FORGE.priceFrom)}` })),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Zapytaj o wycenę Forge', onclick: () => pcRequest({ budget: FORGE.priceFrom / 100, inspiration: FORGE.name, purpose: 'creative' }) })));
  $('#setsNote').textContent = SET_NOTE;
  renderBudget(); applyMedia(grid);
}
/* Dobór do budżetu: najdroższy zestaw poglądowy, który mieści się w budżecie */
function pickSet(grosze) { let pick = SETS[0]; for (const m of SETS) if (setTotal(m) <= grosze) pick = m; return pick; }
function fillRange(sl) { const p = (sl.value - sl.min) / (sl.max - sl.min) * 100; sl.style.background = `linear-gradient(90deg,#FFBB00 ${p}%,rgba(255,255,255,.15) ${p}%)`; }
function renderBudget() {
  const sl = $('#budget'); if (!sl) return;
  const v = +sl.value * 100, pick = pickSet(v);
  $('#bval').textContent = zl(v) + (+sl.value >= +sl.max ? '+' : '');
  $('#tierName').textContent = pick.badge; $('#tierTxt').textContent = pick.desc;
  $('#rSet').textContent = pick.name;
  $('#rParts').textContent = pick.parts.slice(0, 2).map((p) => p[1]).join(' + ');
  $('#rPrice').textContent = `części ${zl(pick.parts_grosze)}${v < setTotal(pick) ? ' · najtańszy wariant' : ''}`;
  $('#rGo').onclick = () => pcRequest({ budget: +sl.value, inspiration: pick.name });
  $('#rJump').onclick = () => { const el = document.getElementById(pick.id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } };
  fillRange(sl);
}

/* ------------------------------------------------------------------ rezerwacja */
// Dwa tryby: 'svc' – usługa (z możliwością łączenia kilku w jednym terminie), 'pc' – komputer na zamówienie (zapytanie z budżetem)
const B = { mode: 'svc', item: '', extras: [], express: false, day: null, slot: null, price: null, visible: false };
const P = { inspiration: '' };
const draftKey = 'stl_booking_draft';
const MAX_EXTRAS = 3;
const svcOf = (id) => cat.services.get(id);
/** Usługa główna + dołączone: łączny czas, cena, tryb (warsztat wygrywa), Express tylko gdy wszystkie go mają. */
function combo() {
  const main = svcOf(B.item); if (!main) return null;
  const ex = B.extras.map(svcOf).filter(Boolean), all = [main, ...ex];
  return {
    main, ex, all, duration: all.reduce((a, s) => a + s.duration_min, 0), base: all.reduce((a, s) => a + s.price_grosze, 0),
    workshop: all.some((s) => s.mode === 'workshop'), express: all.every((s) => s.express_eligible), pct: Math.min(...all.map((s) => s.payment_percent)),
    name: all.map((s) => s.name).join(' + '),
  };
}
function setBookMode(m, { save = true } = {}) {
  B.mode = m === 'pc' ? 'pc' : 'svc';
  $$('#bMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bm === B.mode)));
  $('#bookForm').classList.toggle('hidden', B.mode !== 'svc');
  $('#pcForm').classList.toggle('hidden', B.mode !== 'pc');
  $('#bookLead').textContent = B.mode === 'pc'
    ? 'Podaj budżet i do czego ma służyć komputer. Odezwiemy się z listą części i wyceną – teraz nic nie płacisz.'
    : 'Wybierz usługę (możesz połączyć kilka w jednym terminie), termin i zapłać online przez Stripe. Cenę liczy serwer na podstawie aktualnego cennika.';
  if (B.mode === 'pc') renderPcSummary();
  if (save) saveDraft();
}
function renderItemSelect() {
  const sel = $('#bItem'); const cur = B.item || sel.value;
  sel.replaceChildren(h('option', { value: '', text: '— wybierz usługę —' }));
  for (const c of CATS) {
    const list = [...cat.services.values()].filter((s) => s.kind === 'USLUGA' && s.mode !== 'project' && (s.category || SVC[s.id]?.cat) === c.id);
    if (!list.length) continue;
    sel.append(h('optgroup', { label: c.name }, list.map((s) => h('option', { value: s.id, text: `${s.name} – od ${zl(s.price_grosze)}` }))));
  }
  if (cur && svcOf(cur)?.kind === 'USLUGA' && svcOf(cur).mode !== 'project') { sel.value = cur; B.item = cur; } else { B.item = ''; sel.value = ''; }
  onItemChange(false);
}
/** Otwiera rezerwację usługi (np. z cennika). */
function pickItem(id) {
  if (!svcOf(id) || svcOf(id).kind !== 'USLUGA') return;
  if (svcOf(id).mode === 'project') { askQuote(id); return; }
  setBookMode('svc');
  if (B.item !== id) { B.item = id; B.extras = B.extras.filter((x) => x !== id); }
  $('#bItem').value = id; onItemChange(true);
  saveDraft();
  navigate('/rezerwacja');
}
function renderExtras() {
  const main = svcOf(B.item), wrap = $('#bExtrasWrap'), box = $('#bExtras');
  const list = main && main.mode !== 'project' ? [...cat.services.values()].filter((s) => s.kind === 'USLUGA' && s.mode !== 'project' && s.id !== main.id) : [];
  B.extras = B.extras.filter((id) => list.some((s) => s.id === id));
  wrap.classList.toggle('hidden', !list.length);
  box.replaceChildren(...list.map((s) => h('label', { class: 'extra' },
    h('input', { type: 'checkbox', value: s.id, checked: B.extras.includes(s.id), onchange: (e) => {
      if (e.target.checked) {
        if (B.extras.length >= MAX_EXTRAS) { e.target.checked = false; toast('err', `W jednym terminie połączysz maksymalnie ${MAX_EXTRAS + 1} usługi.`); return; }
        B.extras.push(s.id);
      } else B.extras = B.extras.filter((x) => x !== s.id);
      onExtrasChange();
    } }),
    h('span', { class: 'extra-txt' }, h('b', { text: s.name }), h('small', { text: `+${zl(s.price_grosze)} · ${s.duration_min / 60} h · ${MODE_PILL[s.mode] || ''}` })))));
}
function onExtrasChange() {
  const c = combo();
  if (B.express && !c?.express) { B.express = false; $('#bExpress').checked = false; }
  $('#bExpressWrap').classList.toggle('hidden', !c?.express);
  $('#bHandoverWrap').classList.toggle('hidden', !c?.workshop);
  itemNote(); B.slot = null; renderDays(); refreshPrice(); saveDraft();
}
function itemNote() {
  const c = combo();
  $('#bItemNote').textContent = c ? `${c.ex.length ? 'Łącznie' : 'Czas'}: ${c.duration / 60} h · ${c.workshop ? MODE.workshop : MODE[c.main.mode] || ''} · ${payText({ ...c.main, payment_percent: c.pct })}.` : '';
}
function onItemChange(resetDay = true) {
  renderExtras();
  const c = combo();
  $('#bExpressWrap').classList.toggle('hidden', !c?.express);
  if (!c?.express) { B.express = false; $('#bExpress').checked = false; }
  $('#bHandoverWrap').classList.toggle('hidden', !c?.workshop);
  itemNote(); updateConsents();
  if (resetDay) { B.slot = null; renderDays(); }
  refreshPrice(); saveDraft();
}
const DAY14 = 14 * 864e5;
function needsEarlyStart() {   // zgoda potrzebna tylko konsumentowi, gdy termin wypada w 14 dniach na odstąpienie
  return ctype() === 'consumer' && !!combo() && !!B.slot && new Date(B.slot.starts_at).getTime() - Date.now() < DAY14;
}
function updateConsents() {
  const consumer = ctype() === 'consumer';
  $('#kWithdrawalWrap').classList.toggle('hidden', !consumer);
  $('#kEarlyWrap').classList.toggle('hidden', !needsEarlyStart());
  $('#bBiz').classList.toggle('hidden', consumer);
}
const ctype = () => $('input[name=ctype]:checked')?.value || 'consumer';
function renderDays() {
  const box = $('#bDays'); box.replaceChildren();
  const start = todayKey(); const names = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  let first = null;
  for (let i = 0; i <= 45; i++) {
    const key = addDays(start, i), w = wday(key); if (w === 0 || w === 6) continue;   // pn–pt
    if (i === 0 && !B.express) continue;
    first ||= key;
    const [, m, d] = key.split('-');
    box.append(h('button', { type: 'button', class: 'day', 'aria-pressed': String(key === B.day), dataset: { key }, onclick: () => { B.day = key; B.slot = null; $$('.day', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === key))); loadSlots(); refreshSummary(); } },
      h('small', { text: names[w] }), h('b', { text: String(+d) }), h('span', { text: new Date(Date.UTC(2026, +m - 1, 1)).toLocaleString('pl-PL', { month: 'short', timeZone: 'UTC' }) })));
  }
  if (!B.day || !box.querySelector(`[data-key="${B.day}"]`)) B.day = first;
  $$('.day', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === B.day)));
  box.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  loadSlots();
}
let slotsReq = 0;
async function loadSlots(silent = false) {
  const box = $('#bSlots'), s = svcOf(B.item);
  if (!s) { box.replaceChildren(h('span', { class: 'slots-msg', text: 'Najpierw wybierz usługę.' })); return; }
  if (!sb || !cat.live) { box.replaceChildren(h('span', { class: 'slots-msg', text: sb ? 'Łączę z kalendarzem…' : 'Kalendarz online jest wyłączony. Napisz do nas, a umówimy termin.' })); return; }
  if (!B.day) return;
  const req = ++slotsReq;
  if (!silent) box.replaceChildren(h('span', { class: 'slots-msg', text: 'Sprawdzam wolne godziny…' }));
  const args = { p_service_id: s.id, p_day: B.day };
  if (cat.hasV2) args.p_express = B.express;
  if (B.extras.length) args.p_extras = B.extras;
  const { data, error } = await sb.rpc('get_available_slots', args);
  if (req !== slotsReq) return;                       // przyszła nowsza odpowiedź
  if (error) { if (!silent) box.replaceChildren(h('span', { class: 'slots-msg', text: 'Nie udało się pobrać wolnych godzin. Spróbujemy ponownie za chwilę.' })); conn.wasDown = true; heartbeat(); return; }
  if (!B.slot && B._restoreSlotStart) {
    const restoredSlot = data.find((x) => x.starts_at === B._restoreSlotStart);
    B._restoreSlotStart = '';
    if (restoredSlot) B.slot = restoredSlot;
    else toast('err', 'Poprzedni termin nie jest już dostępny. Wybierz inną godzinę.');
  }
  if (B.slot && !data.some((x) => x.starts_at === B.slot.starts_at)) {
    B.slot = null; toast('err', 'Wybrana godzina została właśnie zajęta. Wybierz inną.'); refreshSummary();
  }
  if (!data.length) { box.replaceChildren(h('span', { class: 'slots-msg', text: 'Brak wolnych godzin tego dnia. Wybierz inny dzień.' })); return; }
  box.replaceChildren(...data.map((x) => h('button', { type: 'button', class: 'slot', 'aria-pressed': String(B.slot?.starts_at === x.starts_at),
    text: `${hm(x.starts_at)}–${hm(x.ends_at)}`, onclick: (e) => { B.slot = x; $$('.slot', box).forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); updateConsents(); refreshSummary(); } })));
}
setInterval(() => { if (document.visibilityState === 'visible' && B.visible && B.mode === 'svc' && B.day && conn.state !== 'offline') loadSlots(true); }, 30000);

let priceReq = 0;
const refreshPrice = debounce(async (announce = false) => {
  const c = combo(); const errEl = $('[data-err=code]'); errEl.textContent = '';
  if (!c) { B.price = null; refreshSummary(); return; }
  const code = $('#bCode').value.trim().toUpperCase();
  const local = () => { const fee = B.express ? 5000 : 0, total = c.base + fee; return { base_grosze: c.base, express_fee_grosze: fee, discount_grosze: 0, total_grosze: total, amount_due_grosze: Math.min(Math.max(Math.round(total * c.pct / 100), 200), total), payment_percent: c.pct, spec: c.ex.length ? { 'Dodatkowo': c.ex.map((s) => s.name).join(', ') } : null, estimate: true }; };
  if (!sb || !cat.live || !cat.hasV2) { B.price = local(); refreshSummary(); return; }
  const req = ++priceReq;
  const opts = B.extras.length ? { extras: B.extras } : {};
  const ask = (k) => sb.rpc('preview_price', { p_service_id: c.main.id, p_options: opts, p_express: B.express, p_code: k || null });
  let { data, error } = await ask(code && session ? code : null);
  if (req !== priceReq) return;
  if (error) { B.price = local(); refreshSummary(); return; }
  let r = data[0];
  if (r.error && code && session && r.error !== 'EXTRAS_INVALID') {
    errEl.textContent = CODE_MSG[r.error] || 'Nie udało się sprawdzić kodu.';
    ({ data } = await ask(null)); r = data?.[0] || r;
  } else if (code && !session) errEl.textContent = 'Kod zostanie sprawdzony po zalogowaniu.';
  else if (code && announce && r.discount_label) toast('ok', `Kod przyjęty: ${r.discount_label}.`);
  if (r.error) { B.price = local(); toast('err', CODE_MSG[r.error] || 'Nie udało się wyliczyć ceny.'); }
  else B.price = r;
  refreshSummary();
}, 250);
function refreshSummary() {
  const c = combo(), p = B.price;
  if (!B.slot) $('#kEarlyWrap')?.classList.add('hidden');
  $('#sumItem').textContent = c ? c.main.name : 'Wybierz usługę.';
  const spec = Object.entries(p?.spec || {}).filter(([k]) => k !== 'Usługa' && k !== 'Dodatkowo');
  $('#sumSpec').replaceChildren(...(c?.ex || []).map((s) => h('li', { class: 'plus', text: `+ ${s.name}` })), ...spec.map(([k, v]) => h('li', { text: `${k}: ${v}` })));
  $('#sumSlot').textContent = B.slot ? `${fmt(B.slot.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })}, ${hm(B.slot.starts_at)}–${hm(B.slot.ends_at)}` : '–';
  $('#sumBase').textContent = p ? zl(p.base_grosze) : '–';
  $('#sumExpressLine').classList.toggle('hidden', !p?.express_fee_grosze); $('#sumExpress').textContent = p ? `+${zl(p.express_fee_grosze)}` : '';
  $('#sumDiscLine').classList.toggle('hidden', !p?.discount_grosze); $('#sumDisc').textContent = p ? `−${zl(p.discount_grosze)}` : ''; $('#sumDiscLbl').textContent = p?.discount_label || 'Rabat';
  $('#sumTotal').textContent = p ? zl(p.total_grosze) : '–';
  $('#sumDue').textContent = p ? zl(p.amount_due_grosze) : '–';
  $('#sumDueLbl').textContent = p && p.payment_percent < 100 ? `Zaliczka ${p.payment_percent}% teraz` : 'Do zapłaty teraz';
  const can = !!(c && B.slot && p && sb && cat.live);
  $('#payBtn').disabled = !can;
  $('#payHint').textContent = !sb ? 'Rezerwacje online są chwilowo wyłączone – napisz do nas przez formularz kontaktowy.'
    : !session ? 'Karta, BLIK lub Przelewy24 przez Stripe. Do zamówienia potrzebne jest konto – założysz je w minutę.'
      : p?.estimate ? 'Cena orientacyjna – ostateczną kwotę wyliczy serwer.' : 'Karta, BLIK lub Przelewy24. Termin czeka 35 minut na płatność.';
}
function saveDraft() {
  store.set(draftKey, {
    mode: B.mode, item: B.item, extras: B.extras, express: B.express, day: B.day || '', slotStart: B.slot?.starts_at || B._restoreSlotStart || '', ctype: ctype(), name: $('#bName').value, phone: $('#bPhone').value, company: $('#bCompany').value, nip: $('#bNip').value, note: $('#bNote').value, code: $('#bCode').value, handover: $('input[name=handover]:checked')?.value || '', city: $('#bCity').value,
    pc: { budget: $('#pcBudget').value, purpose: $('input[name=pcPurpose]:checked')?.value || '', have: $$('input[name=pcHave]:checked').map((x) => x.value), add: $$('input[name=pcAdd]:checked').map((x) => x.value), note: $('#pcNote').value, inspiration: P.inspiration, name: $('#pcName').value, email: $('#pcMail').value, phone: $('#pcPhone').value },
  });
}
function restoreDraft() {
  const d = store.get(draftKey); if (!d) return;
  B.mode = d.mode === 'pc' ? 'pc' : 'svc';
  B.item = d.item || ''; B.extras = Array.isArray(d.extras) ? d.extras.slice(0, MAX_EXTRAS) : []; B.express = !!d.express; B.day = typeof d.day === 'string' ? d.day : (B.day || ''); B._restoreSlotStart = typeof d.slotStart === 'string' ? d.slotStart : ''; $('#bExpress').checked = B.express;
  for (const [id, k] of [['bName', 'name'], ['bPhone', 'phone'], ['bCompany', 'company'], ['bNip', 'nip'], ['bNote', 'note'], ['bCode', 'code'], ['bCity', 'city']]) if (d[k]) $('#' + id).value = d[k];
  if (d.ctype) { const r = $(`input[name=ctype][value=${d.ctype}]`); if (r) r.checked = true; }
  if (d.handover) { const r = $(`input[name=handover][value=${d.handover}]`); if (r) r.checked = true; }
  const pc = d.pc || {};
  if (pc.budget) $('#pcBudget').value = pc.budget;
  if (pc.purpose) { const r = $(`input[name=pcPurpose][value=${pc.purpose}]`); if (r) r.checked = true; }
  $$('input[name=pcHave]').forEach((x) => { x.checked = (pc.have || []).includes(x.value); });
  $$('input[name=pcAdd]').forEach((x) => { x.checked = (pc.add || []).includes(x.value); });
  for (const [id, k] of [['pcNote', 'note'], ['pcName', 'name'], ['pcMail', 'email'], ['pcPhone', 'phone']]) if (pc[k]) $('#' + id).value = pc[k];
  P.inspiration = pc.inspiration || '';
}
function bindBooking() {
  $$('#bMode button').forEach((b) => b.addEventListener('click', () => setBookMode(b.dataset.bm)));
  $('#bItem').addEventListener('change', (e) => { B.item = e.target.value; B.extras = B.extras.filter((x) => x !== B.item); onItemChange(true); });
  $('#bExpress').addEventListener('change', (e) => { B.express = e.target.checked; B.slot = null; renderDays(); refreshPrice(); saveDraft(); });
  $$('input[name=ctype]').forEach((r) => r.addEventListener('change', () => { updateConsents(); saveDraft(); }));
  $('#bookForm').addEventListener('input', debounce(saveDraft, 400));
  $('#bCode').addEventListener('input', debounce(() => refreshPrice(), 600));
  $('#bCodeBtn').addEventListener('click', () => refreshPrice(true));
  $('#bookForm').addEventListener('submit', (e) => { e.preventDefault(); submitBooking(); });
  $('#pcForm').addEventListener('input', () => { renderPcSummary(); saveDraft(); });
  $('#pcForm').addEventListener('change', () => { renderPcSummary(); saveDraft(); });
  $('#pcForm').addEventListener('submit', (e) => { e.preventDefault(); submitPc(); });
  new IntersectionObserver((es) => es.forEach((x) => { B.visible = x.isIntersecting; }), { rootMargin: '200px' }).observe($('#rezerwacja'));
}
let pendingPay = false;
const ERR_TARGET = { name: '#bName', phone: '#bPhone', company: '#bCompany', nip: '#bNip', code: '#bCode', handover: 'input[name=handover]', consents: '#kTerms',
  pcName: '#pcName', pcMail: '#pcMail', pcPhone: '#pcPhone', pcPurpose: 'input[name=pcPurpose]', pcConsent: '#pcConsent' };
function fieldErrors(fields, form = '#bookForm') {
  $$(`${form} [data-err]`).forEach((el) => { el.textContent = ''; });
  $$(`${form} [aria-invalid]`).forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [k, msg] of Object.entries(fields || {})) {
    const el = $(`${form} [data-err=${k}]`); if (el) el.textContent = msg;
    let inp = ERR_TARGET[k] ? $(`${form} ${ERR_TARGET[k]}`) : null;
    if (k === 'consents') inp = ['#kTerms', '#kPrivacy', '#kWithdrawal', '#kEarly'].map((q) => $(q)).find((x) => x && !x.checked && !x.closest('.hidden')) || inp;
    if (inp) { inp.setAttribute('aria-invalid', 'true'); first ||= inp; } else if (el) first ||= el;
  }
  if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus?.({ preventScroll: true }); }
}
function validNip(nip) { const n = nip.replace(/\D/g, ''); if (n.length !== 10) return false; const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]; const s = w.reduce((a, x, i) => a + x * +n[i], 0) % 11; return s !== 10 && s === +n[9]; }
async function submitBooking() {
  const c = combo(); if (!c || !B.slot) return;
  const f = {}, type = ctype(), consumer = type === 'consumer';
  const name = $('#bName').value.trim(), phone = $('#bPhone').value.trim();
  if (name.length < 3) f.name = 'Podaj imię i nazwisko (lub nazwę firmy).';
  if (phone && phone.replace(/\D/g, '').length < 9) f.phone = 'Numer telefonu wygląda na niepełny (min. 9 cyfr). Popraw go albo zostaw pole puste.';
  if (!consumer) { if ($('#bCompany').value.trim().length < 2) f.company = 'Podaj nazwę firmy.'; if (!validNip($('#bNip').value)) f.nip = 'Podaj poprawny NIP (10 cyfr).'; }
  const handover = $('input[name=handover]:checked')?.value || null;
  if (c.workshop && !handover) f.handover = 'Wybierz sposób przekazania sprzętu.';
  if (!$('#kTerms').checked || !$('#kPrivacy').checked) f.consents = 'Zaakceptuj Regulamin i Politykę Prywatności.';
  else if (consumer && !$('#kWithdrawal').checked) f.consents = 'Potwierdź zapoznanie się z pouczeniem o odstąpieniu od umowy.';
  else if (needsEarlyStart() && !$('#kEarly').checked) f.consents = 'Termin wypada w ciągu 14 dni – potwierdź żądanie rozpoczęcia usługi przed upływem terminu na odstąpienie albo wybierz późniejszy termin.';
  fieldErrors(f); if (Object.keys(f).length) return;
  if (!session) { pendingPay = true; askLogin('checkout', { title: 'Zaloguj się, żeby zamówić', text: 'Zamówienie i płatność wymagają konta. Wybrany termin i dane z formularza zostaną zachowane – po zalogowaniu sprawdzimy, czy termin jest nadal wolny.' }); return; }
  const btn = $('#payBtn'); setBusy(btn, true, 'Przekierowuję do płatności…');
  try {
    const data = await callFn('create-checkout', {
      service_id: c.main.id, extras: B.extras.length ? B.extras : undefined, starts_at: B.slot.starts_at, express: B.express, code: $('#bCode').value.trim() || undefined,
      note: $('#bNote').value.trim() || undefined, handover, city: $('#bCity').value.trim() || undefined,
      customer: { name, phone: phone || undefined, type, company: $('#bCompany').value.trim() || undefined, nip: $('#bNip').value.trim() || undefined },
      consents: { terms: true, privacy: true, withdrawal: $('#kWithdrawal').checked, earlyStart: needsEarlyStart() && $('#kEarly').checked, marketing: $('#kMarketing').checked },
    });
    store.set('stl_last_order', data.order_id);
    location.href = data.url;
  } catch (e) {
    setBusy(btn, false, 'Zamawiam z obowiązkiem zapłaty');
    if (e.fields) { const ff = { ...e.fields }; if (ff.consents) ff.consents = e.message; fieldErrors(ff); }
    if (e.code && /^(REFERRAL|CODE)/.test(e.code)) $('[data-err=code]').textContent = e.message;
    banner('#bookBanner', 'err', e.message);
    if (e.code === 'SLOT_TAKEN' || /^SLOT/.test(e.code || '')) { B.slot = null; loadSlots(); refreshSummary(); }
    toast('err', e.message);
  }
}

/* ------------------------------------------------------------------ komputer na zamówienie (zapytanie z budżetem, bez płatności) */
const PC_PURPOSE = { esport: 'Gry e-sportowe (wysoki FPS)', aaa: 'Gry AAA w 1440p', k4: 'Gry w 4K', creative: 'Praca twórcza (3D, wideo, grafika)', office: 'Praca, nauka i multimedia' };
const PC_HAVE = { monitor: 'monitor', peripherals: 'klawiatura i mysz', windows: 'licencja Windows', parts: 'część podzespołów (np. karta graficzna)' };
const PC_ADD = { windows: 'Instalacja i konfiguracja Windows', tune: 'Optymalizacja po złożeniu (STRIKE Precision Tune)', transfer: 'Przeniesienie danych ze starego komputera' };
/** Otwiera rezerwację w trybie „komputer na zamówienie”, z budżetem i inspiracją (np. z karty zestawu). */
function pcRequest({ budget, inspiration = '', purpose } = {}) {
  const sl = $('#pcBudget');
  if (budget) sl.value = String(Math.min(+sl.max, Math.max(+sl.min, Math.round(budget / 250) * 250)));
  P.inspiration = inspiration;
  if (purpose) { const r = $(`input[name=pcPurpose][value=${purpose}]`); if (r) r.checked = true; }
  setBookMode('pc');
  navigate('/rezerwacja');
}
function renderPcSummary() {
  const sl = $('#pcBudget'), v = +sl.value;
  const label = zl(v * 100) + (v >= +sl.max ? '+' : '');
  $('#pcBval').textContent = label; $('#pcSumBudget').textContent = label;
  fillRange(sl);
  const purpose = $('input[name=pcPurpose]:checked')?.value;
  $('#pcSumPurpose').textContent = PC_PURPOSE[purpose] || '–';
  const adds = $$('input[name=pcAdd]:checked').map((x) => PC_ADD[x.value]);
  $('#pcSumAdd').replaceChildren(...adds.map((t) => h('li', { class: 'plus', text: `+ ${t}` })));
  const insp = $('#pcInsp');
  insp.classList.toggle('hidden', !P.inspiration);
  insp.replaceChildren(h('span', { text: `Inspiracja: ${P.inspiration}` }), h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Usuń inspirację', text: '×', onclick: () => { P.inspiration = ''; renderPcSummary(); saveDraft(); } }));
  const fit = SETS.filter((m) => setTotal(m) <= v * 100).pop();
  $('#pcHint').textContent = fit
    ? `W tym budżecie mieści się np. ${fit.name}: ${fit.parts[0][1]} + ${fit.parts[1][1]}. Dobierzemy części pod Twoje gry i programy.`
    : 'Poniżej naszych zestawów poglądowych – napisz, czego potrzebujesz, a zaproponujemy najlepsze, co się zmieści.';
}
async function submitPc() {
  const v = { name: $('#pcName').value.trim(), email: $('#pcMail').value.trim(), phone: $('#pcPhone').value.trim() };
  const purpose = $('input[name=pcPurpose]:checked')?.value;
  const f = {};
  if (!purpose) f.pcPurpose = 'Wybierz, do czego ma służyć komputer.';
  if (v.name.length < 2) f.pcName = 'Podaj imię.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) f.pcMail = 'Podaj poprawny adres e-mail.';
  if (v.phone && v.phone.replace(/\D/g, '').length < 9) f.pcPhone = 'Numer telefonu jest za krótki.';
  if (!$('#pcConsent').checked) f.pcConsent = 'Potwierdź, że znasz Politykę Prywatności.';
  fieldErrors(f, '#pcForm'); if (Object.keys(f).length) return;
  const budget = zl(+$('#pcBudget').value * 100);
  const have = $$('input[name=pcHave]:checked').map((x) => PC_HAVE[x.value]);
  const adds = $$('input[name=pcAdd]:checked').map((x) => PC_ADD[x.value]);
  const note = $('#pcNote').value.trim();
  const message = [
    'Komputer na zamówienie', `Budżet: ${budget}`, `Przeznaczenie: ${PC_PURPOSE[purpose]}`,
    have.length ? `Klient ma już: ${have.join(', ')}` : 'Klient ma już: nic z listy',
    adds.length ? `Dodatkowo: ${adds.join('; ')}` : null, P.inspiration ? `Inspiracja: ${P.inspiration}` : null,
    note ? `\nUwagi klienta:\n${note}` : null,
  ].filter(Boolean).join('\n');
  if (!sb) {
    location.href = `mailto:${CFG.CONTACT_EMAIL}?subject=${encodeURIComponent(`Komputer na zamówienie – ${budget}`)}&body=${encodeURIComponent(`${message}\n\n${v.name}\n${v.email}${v.phone ? '\n' + v.phone : ''}`)}`;
    return;
  }
  const btn = $('#pcSend'); setBusy(btn, true, 'Wysyłam…');
  try {
    await callFn('inquiry', { kind: 'quote', ...v, topic: `Komputer na zamówienie – ${budget}`, item_id: 'pc-custom', message, consent: true, hp: $('#pcHp').value });
    banner('#bookBanner', 'ok', `Dziękujemy, ${v.name}! Zapytanie o komputer za ${budget} dotarło. Odezwiemy się mailem z propozycją części i wyceną.`);
    toast('ok', 'Zapytanie wysłane.');
    $('#pcNote').value = ''; P.inspiration = ''; renderPcSummary(); saveDraft();
    $('#bookBanner').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    banner('#bookBanner', 'err', `${err.message} Możesz też napisać bezpośrednio: ${CFG.CONTACT_EMAIL}`);
    const map = { name: 'pcName', email: 'pcMail', phone: 'pcPhone', consent: 'pcConsent' };
    fieldErrors(Object.fromEntries(Object.entries(err.fields || {}).map(([k, m]) => [map[k] || k, m])), '#pcForm');
  }
  setBusy(btn, false, 'Wyślij zapytanie o wycenę');
}

/* ------------------------------------------------------------------ powrót ze Stripe */
async function handleStripeReturn() {
  const q = new URLSearchParams(location.search), mode = q.get('checkout');
  const ref = q.get('ref'); if (ref && /^[A-Z0-9_-]{4,40}$/i.test(ref)) { $('#bCode').value = ref.toUpperCase(); saveDraft(); }
  if (!mode && !ref) return;
  navigate(mode === 'success' ? '/konto' : mode === 'cancel' || ref ? '/rezerwacja' : route, { replace: true });
  if (mode === 'cancel') {
    const orderId = q.get('order_id');
    banner('#bookBanner', 'info', 'Płatność przerwana. Zwalniam zarezerwowany termin…');
    if (session && orderId) { try { await callFn('cancel-checkout', { order_id: orderId }); } catch { /* termin i tak wygaśnie po 35 min */ } }
    banner('#bookBanner', 'info', 'Płatność przerwana – termin wrócił do kalendarza. Możesz wybrać go ponownie albo inny.');
    loadSlots(true); loadPanelData();
  }
  if (mode === 'success') {
    const sid = q.get('session_id'); store.del(draftKey);
    banner('#panelBanner', 'info', 'Płatność przyjęta przez Stripe. Czekam na potwierdzenie z systemu…');
    for (let i = 0; i < 45 && session; i++) {
      const { data } = await sb.from('orders').select('order_number,status').eq('stripe_session_id', sid).maybeSingle();
      if (data?.order_number) { banner('#panelBanner', 'ok', `Opłacono! Numer zlecenia: ${data.order_number}. Potwierdzenie wysłaliśmy mailem.`); loadPanelData(); loadSlots(true); return; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    banner('#panelBanner', 'info', 'Płatność jest księgowana. Status zmieni się tu sam, a potwierdzenie dostaniesz mailem.');
  }
}

/* ------------------------------------------------------------------ logowanie */
/* „Nie wylogowuj mnie”: zaznaczone (domyślnie) = sesja w pamięci lokalnej, przetrwa zamknięcie przeglądarki;
   odznaczone = pamięć sesji, wylogowanie po zamknięciu karty. Supabase sam odświeża token w tle. */
const REMEMBER_KEY = 'stl_remember';
const remembered = () => { try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return false; } };
const AUTH_STORE = {
  getItem(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { try { return sessionStorage.getItem(k); } catch { return null; } } },
  setItem(k, v) { try { const keep = remembered(); (keep ? localStorage : sessionStorage).setItem(k, v); (keep ? sessionStorage : localStorage).removeItem(k); } catch { /* tryb prywatny */ } },
  removeItem(k) { try { localStorage.removeItem(k); } catch { /* */ } try { sessionStorage.removeItem(k); } catch { /* */ } },
};
function setRemember(on) { try { on ? localStorage.removeItem(REMEMBER_KEY) : localStorage.setItem(REMEMBER_KEY, '0'); } catch { /* */ } }
let authMode = 'login';
const AUTH_RETURN_KEY = 'stl_auth_return_v1';
function saveAuthReturn(intent) {
  try {
    if (['booking', 'checkout', 'chat', 'consult'].includes(intent)) sessionStorage.setItem(AUTH_RETURN_KEY, intent);
  } catch (e) { console.warn('Nie udało się zapisać celu powrotu OAuth.', e); }
}
function takeAuthReturn() {
  try {
    const intent = sessionStorage.getItem(AUTH_RETURN_KEY) || '';
    sessionStorage.removeItem(AUTH_RETURN_KEY);
    return ['booking', 'checkout', 'chat', 'consult'].includes(intent) ? intent : '';
  } catch { return ''; }
}
function openAuth(mode = 'login', hint = '', focusField = true) {
  authMode = mode;
  if (route !== '/konto') navigate('/konto');
  $('#authTitle').textContent = { login: 'Zaloguj się', register: 'Załóż konto', reset: 'Reset hasła', newpass: 'Ustaw nowe hasło' }[mode];
  $('#authHint').textContent = hint || { login: '', register: 'Hasło: min. 10 znaków. Po rejestracji potwierdź adres e-mail linkiem z wiadomości.', reset: 'Wyślemy link do ustawienia nowego hasła.', newpass: 'Wpisz nowe hasło (min. 10 znaków).' }[mode];
  $$('#authTabs .tab').forEach((t) => { const on = t.dataset.mode === mode; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  $('#authTabs').classList.toggle('hidden', mode === 'newpass');
  renderSocial();
  $$('#authForm [data-for]').forEach((el) => el.classList.toggle('hidden', !el.dataset.for.split(' ').includes(mode)));
  $('#aPassLbl').textContent = mode === 'newpass' ? 'Nowe hasło' : 'Hasło';
  $('#aPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#authSubmit').textContent = { login: 'Zaloguj się', register: 'Załóż konto', reset: 'Wyślij link', newpass: 'Zapisz hasło' }[mode];
  $('#authMsg').textContent = ''; $('#authMsg').className = 'form-msg';
  if ($('#aRemember')) $('#aRemember').checked = remembered();
  renderPanel(); if (mode !== 'newpass') renderCaptcha();
  if (focusField) setTimeout(() => (mode === 'register' ? $('#aName') : mode === 'newpass' ? $('#aPass') : $('#aMail')).focus(), 30);
}
const AUTH_ERR = (m) => /Invalid login/i.test(m) ? 'Nieprawidłowy e-mail lub hasło.' : /not confirmed/i.test(m) ? 'Najpierw potwierdź adres e-mail (link w wiadomości).'
  : /already registered|already exists/i.test(m) ? 'Konto z tym adresem już istnieje. Zaloguj się lub zresetuj hasło.' : /rate limit|too many/i.test(m) ? 'Zbyt wiele prób. Spróbuj ponownie za chwilę.'
    : /password/i.test(m) ? 'Hasło jest za słabe. Użyj min. 10 znaków.' : /fetch|network/i.test(m) ? 'Brak połączenia z serwerem.' : m;
/* CAPTCHA (Cloudflare Turnstile) – ładowana tylko, gdy TURNSTILE_SITE_KEY jest wpisany */
const CAP = { id: null, token: '', loading: null };
function loadTurnstile() {
  if (!CFG.TURNSTILE_SITE_KEY) return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  CAP.loading ||= new Promise((ok) => { const el = document.createElement('script'); el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; el.async = true; el.onload = () => ok(window.turnstile || null); el.onerror = () => ok(null); document.head.append(el); });
  return CAP.loading;
}
async function renderCaptcha() {
  const ts = await loadTurnstile(); if (!ts) return;
  if (CAP.id !== null || !$('#captchaBox')?.offsetParent) return;   // raz, i tylko gdy formularz jest widoczny
  CAP.id = ts.render('#captchaBox', { sitekey: CFG.TURNSTILE_SITE_KEY, language: 'pl', theme: 'dark', callback: (t) => { CAP.token = t; }, 'expired-callback': () => { CAP.token = ''; }, 'error-callback': () => { CAP.token = ''; } });
}
function captchaReset() { if (CAP.id !== null && window.turnstile) { window.turnstile.reset(CAP.id); CAP.token = ''; } }
async function submitAuth(e) {
  e.preventDefault(); if (!sb) { $('#authMsg').textContent = 'Logowanie jest chwilowo niedostępne.'; return; }
  const msg = $('#authMsg'), btn = $('#authSubmit'); msg.className = 'form-msg';
  const email = $('#aMail').value.trim(), pass = $('#aPass').value;
  const say = (kind, t) => { msg.className = `form-msg ${kind}`; msg.textContent = t; };
  if (authMode !== 'newpass' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say('err', 'Podaj poprawny adres e-mail.');
  if ((authMode === 'register' || authMode === 'newpass') && pass.length < 10) return say('err', 'Hasło musi mieć co najmniej 10 znaków.');
  if (authMode === 'register' && !$('#aTerms').checked) return say('err', 'Zaakceptuj Regulamin i Politykę Prywatności.');
  const captchaToken = CFG.TURNSTILE_SITE_KEY && authMode !== 'newpass' ? CAP.token : undefined;
  if (CFG.TURNSTILE_SITE_KEY && authMode !== 'newpass' && !captchaToken) return say('err', 'Potwierdź, że nie jesteś robotem (pole nad przyciskiem).');
  setBusy(btn, true);
  try {
    if (authMode === 'login') {
      setRemember($('#aRemember').checked);
      const { error } = await sb.auth.signInWithPassword({ email, password: pass, options: { captchaToken } }); if (error) throw error;
      toast('ok', 'Zalogowano.');
    } else if (authMode === 'register') {
      const mk = $('#aMarketing').checked;
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { captchaToken, data: { full_name: $('#aName').value.trim(), ...(mk ? { marketing_consent_at: new Date().toISOString() } : {}) }, emailRedirectTo: SITE_URL + 'konto' } });
      if (error) throw error;
      if (data.session) toast('ok', 'Konto utworzone. Witaj!');
      else say('ok', 'Konto utworzone. Kliknij link w mailu, który właśnie wysłaliśmy, a potem zaloguj się.');
    } else if (authMode === 'reset') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { captchaToken, redirectTo: SITE_URL + 'konto' }); if (error) throw error;
      say('ok', 'Jeśli konto istnieje, wysłaliśmy link do ustawienia nowego hasła.');
    } else if (authMode === 'newpass') {
      const { error } = await sb.auth.updateUser({ password: pass }); if (error) throw error;
      authMode = 'login'; renderPanel(); toast('ok', 'Hasło zmienione.');
    }
  } catch (err) { say('err', /captcha/i.test(err.message || '') ? 'Weryfikacja „nie jestem robotem” nie powiodła się. Spróbuj ponownie.' : AUTH_ERR(err.message || String(err))); }
  captchaReset();
  setBusy(btn, false, $('#authSubmit').dataset.label);
}
let sessionQueue = Promise.resolve();
function onSession(s) { sessionQueue = sessionQueue.then(() => applySession(s)).catch((e) => console.error(e)); return sessionQueue; }
async function applySession(s) {
  const was = session?.user?.id; session = s;
  $('#acctTxt').textContent = s ? 'Moje konto' : 'Zaloguj';
  if (!s) { profile = null; isAdmin = false; unsubscribeRealtime(); renderPanel(); refreshSummary(); renderConsole(); chatOnSession(); if (authKnown && route === '/rezerwacja') navigate('/', { replace: true }); return; }
  if (was === s.user.id && profile) return;
  await loadProfile();
  if (isAdmin) adminReady().catch(() => {});   // panel administratora w tle, zanim go otworzysz
  if (s.user.user_metadata?.marketing_consent_at && profile && cat.hasV2) {   // zgoda z formularza rejestracji – zapisz raz, potem usuń znacznik
    const { error } = await sb.from('profiles').update({ marketing: true }).eq('id', s.user.id);
    if (!error) { profile.marketing = true; await sb.auth.updateUser({ data: { marketing_consent_at: null } }); }
  }
  if (!$('#bName').value && profile?.full_name) $('#bName').value = profile.full_name;
  if (!$('#bPhone').value && profile?.phone) $('#bPhone').value = profile.phone;
  renderPanel(); loadPanelData(); subscribeRealtime(); refreshPrice(); renderConsole();
  chatOnSession(); syncSocial();
  if (!$('#pcMail').value && session?.user?.email) $('#pcMail').value = session.user.email;
  if (!$('#pcName').value && profile?.full_name) $('#pcName').value = profile.full_name;
  const authReturn = takeAuthReturn();
  if (authReturn === 'booking' || authReturn === 'checkout') {
    pendingPay = false;
    navigate('/rezerwacja');
    banner('#bookBanner', 'info', authReturn === 'checkout'
      ? 'Zalogowano. Sprawdź dane i dostępność terminu, a następnie kliknij „Zamawiam z obowiązkiem zapłaty”.'
      : 'Zalogowano. Możesz kontynuować rezerwację; sprawdzamy ponownie dostępność terminu.');
    if (B.day) await loadSlots(true);
  } else if (authReturn === 'chat') {
    setTimeout(() => chatOpen('msgs'), 300);
  } else if (authReturn === 'consult') {
    setTimeout(startConsult, 300);
  } else if (pendingPay) {
    pendingPay = false; navigate('/rezerwacja');
    banner('#bookBanner', 'info', 'Zalogowano. Sprawdź dane i kliknij „Zamawiam z obowiązkiem zapłaty”, żeby przejść do płatności.');
    if (B.day) await loadSlots(true);
  }
}
async function loadProfile() {
  if (!session) return;
  let r = await sb.from('profiles').select('id,email,full_name,phone,referral_code,is_admin,marketing').eq('id', session.user.id).maybeSingle();
  if (r.error && /column/.test(r.error.message)) r = await sb.from('profiles').select('id,email,full_name,phone,referral_code,is_admin').eq('id', session.user.id).maybeSingle();
  profile = r.data || { email: session.user.email }; isAdmin = !!profile.is_admin;
}

/* ------------------------------------------------------------------ realtime */
let channel = null, rtRetry = null;
const onLiveChange = debounce(() => { log('zmiana zamówienia – odświeżam'); loadPanelData(); if (B.day) loadSlots(true); }, 400);
function subscribeRealtime() {
  unsubscribeRealtime(); if (!sb || !session) return;
  const filter = isAdmin ? {} : { filter: `user_id=eq.${session.user.id}` };
  channel = sb.channel(`stl-live-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', ...filter }, onLiveChange);
  if (cat.hasV2) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, onLiveChange).on('postgres_changes', { event: '*', schema: 'public', table: 'order_results' }, onLiveChange);
  channel.subscribe((status) => {
    conn.realtime = status === 'SUBSCRIBED'; renderConsole();
    if (status === 'SUBSCRIBED') log('aktualizacje na żywo: włączone');
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(rtRetry); if (session) rtRetry = setTimeout(subscribeRealtime, 15000); }
  });
}
function unsubscribeRealtime() { clearTimeout(rtRetry); if (channel && sb) sb.removeChannel(channel); channel = null; conn.realtime = false; }
setInterval(() => { if (session && document.visibilityState === 'visible' && conn.state !== 'offline' && !conn.realtime) loadPanelData(); }, 60000);
setInterval(() => { if (session && document.visibilityState === 'visible' && conn.state !== 'offline') loadPanelData(); }, 180000);

/* ------------------------------------------------------------------ opinie klientów (migracja v18)
   Opinię wystawia tylko klient z zakończonym zleceniem; publikuje administrator. */
const starsTxt = (n) => [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= n ? '' : 'off', text: '★' }));
async function loadReviews() {
  if (!sb) return;
  const [r, st] = await Promise.all([
    sb.from('reviews').select('id,rating,body,display_name,service_name,reply,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(12),
    sb.rpc('review_stats'),
  ]);
  const sec = $('#opinie'); if (!sec) return;
  if (r.error || !r.data?.length) { sec.classList.add('hidden'); return; }
  const s0 = Array.isArray(st.data) ? st.data[0] : st.data;
  $('#revStats').replaceChildren(...(s0?.total ? [h('span', { class: 'rev-stars', 'aria-hidden': 'true' }, starsTxt(Math.round(+s0.avg_rating))), h('span', { text: String(s0.avg_rating).replace('.', ',') }), h('small', { text: `/ 5 · ${s0.total} ${s0.total === 1 ? 'opinia' : s0.total < 5 ? 'opinie' : 'opinii'}` })] : []));
  $('#revList').replaceChildren(...r.data.map((x) => h('article', { class: 'rev-card' },
    h('div', { class: 'rev-stars', role: 'img', 'aria-label': `Ocena ${x.rating} na 5` }, starsTxt(x.rating)),
    h('p', { class: 'rev-body', text: x.body }),
    x.reply ? h('div', { class: 'rev-reply' }, h('b', { text: 'Odpowiedź Strike Tech Lab' }), x.reply) : null,
    h('div', { class: 'rev-meta' }, h('b', { text: x.display_name }), ` · ${x.service_name || 'usługa'} · ${fmt(x.published_at, { month: 'long', year: 'numeric' })}`))));
  sec.classList.remove('hidden');
}
let MY_REVIEWS = new Map();
async function loadMyReviews(list) {
  const ids = list.filter((o) => o.status === 'ZAKONCZONE').map((o) => o.id);
  if (!ids.length || !sb) { MY_REVIEWS = new Map(); return; }
  const { data, error } = await sb.from('reviews').select('order_id,rating,body,status,reject_reason,reply').in('order_id', ids);
  MY_REVIEWS = error ? new Map() : new Map((data || []).map((x) => [x.order_id, x]));
}
function reviewBox(o) {
  const mine = MY_REVIEWS.get(o.id);
  if (mine && mine.status !== 'pending') {
    return h('div', { class: 'rev-box' }, h('h4', { text: mine.status === 'published' ? 'Twoja opinia jest opublikowana – dziękujemy!' : 'Twoja opinia nie została opublikowana' }),
      h('div', { class: 'rev-stars', 'aria-hidden': 'true' }, starsTxt(mine.rating)), h('p', { class: 'rev-body', text: mine.body }),
      mine.status === 'rejected' && mine.reject_reason ? h('p', { class: 'muted small', text: `Powód: ${mine.reject_reason}. Napisz do nas na czacie, jeśli chcesz to wyjaśnić.` }) : null,
      mine.reply ? h('div', { class: 'rev-reply' }, h('b', { text: 'Nasza odpowiedź' }), mine.reply) : null);
  }
  let rating = mine?.rating || 0;
  const pick = h('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': 'Ocena od 1 do 5' });
  const paint = () => [...pick.children].forEach((b, i) => { b.classList.toggle('on', i < rating); b.setAttribute('aria-checked', String(i + 1 === rating)); });
  for (let i = 1; i <= 5; i++) pick.append(h('button', { type: 'button', role: 'radio', 'aria-label': `${i} na 5`, text: '★', onclick: () => { rating = i; paint(); } }));
  paint();
  const ta = h('textarea', { class: 'textarea', rows: 3, maxlength: '800', placeholder: 'Jak przebiegła usługa? Co się poprawiło?' }); ta.value = mine?.body || '';
  const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: mine ? 'Popraw opinię' : 'Wyślij opinię' });
  return h('form', { class: 'rev-box', onsubmit: async (e) => {
    e.preventDefault();
    if (!rating) return toast('err', 'Wybierz ocenę – kliknij gwiazdki.');
    if (ta.value.trim().length < 10) return toast('err', 'Napisz kilka słów (min. 10 znaków).');
    setBusy(btn, true);
    const { error } = await sb.rpc('review_submit', { p_order: o.id, p_rating: rating, p_body: ta.value.trim() });
    setBusy(btn, false, mine ? 'Popraw opinię' : 'Wyślij opinię');
    if (error) return toast('err', /function .*does not exist|schema cache/i.test(error.message) ? 'Opinie nie są jeszcze włączone w bazie (migracja v18).' : error.message);
    toast('ok', 'Dziękujemy! Opinia pojawi się na stronie po zatwierdzeniu.');
    await loadMyReviews(orders); renderOrders();
  } },
  h('h4', { text: mine ? 'Twoja opinia czeka na zatwierdzenie – możesz ją jeszcze poprawić' : 'Jak oceniasz usługę?' }),
  h('p', { class: 'muted small', style: 'margin:0', text: 'Na stronie pokażemy imię i pierwszą literę nazwiska, ocenę i treść.' }),
  pick, ta, h('div', { style: 'margin-top:8px' }, btn));
}

/* ------------------------------------------------------------------ panel administratora (assets/admin.js)
   Klienci go nie pobierają – plik wczytuje się dopiero po zalogowaniu administratora. */
let ADMIN_LOAD = null;
function adminReady() {
  return (ADMIN_LOAD ||= new Promise((ok, no) => {
    const el = document.createElement('script'); el.src = BASE + 'assets/admin.js'; el.async = true;
    el.onload = () => ok(); el.onerror = () => { ADMIN_LOAD = null; el.remove(); no(new Error('Nie udało się wczytać panelu administratora. Odśwież stronę.')); };
    document.head.append(el);
  }));
}
function withAdmin(fn) { if (!isAdmin) return; adminReady().then(fn, (e) => toast('err', e.message)); }

/* ------------------------------------------------------------------ Strefa Klienta */
let activeTab = ((t) => ['orders', 'programs', 'refs', 'account', 'brief', 'admin', 'guides', 'finance', 'prices'].includes(t) ? t : 'orders')(new URLSearchParams(location.search).get('tab'));   // ?tab=brief z powiadomienia
function renderPanel() {
  const on = !!session;
  const showAuth = !on || authMode === 'newpass';
  if (showAuth && authMode !== 'newpass' && route === '/konto') setTimeout(renderCaptcha, 0);
  $('#panelOut').classList.toggle('hidden', !showAuth); $('#panelIn').classList.toggle('hidden', !on || authMode === 'newpass');
  $('#panelTitle').textContent = on ? `Cześć${profile?.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}!` : 'Twoje zlecenia w jednym miejscu';
  $('#panelLead').textContent = on ? 'Status zleceń zmienia się tu na żywo. Raporty i wyniki pomiarów pojawią się po testach.' : 'Status na żywo, raporty z pomiarów, kod polecający i dane konta.';
  $('#adminTabBtn').classList.toggle('hidden', !isAdmin);
  $('#guidesTabBtn').classList.toggle('hidden', !isAdmin);
  $('#financeTabBtn').classList.toggle('hidden', !isAdmin);
  $('#pricesTabBtn')?.classList.toggle('hidden', !isAdmin);
  $('#briefTabBtn')?.classList.toggle('hidden', !isAdmin);
  // Administrator nie składa zleceń sam sobie – zamiast „Zleceń” od razu widzi „Administrację”
  $('#panelTabs [data-tab=orders]').classList.toggle('hidden', isAdmin);
  if (!isAdmin && ['admin', 'guides', 'finance', 'prices', 'brief'].includes(activeTab)) activeTab = 'orders';
  if (isAdmin && activeTab === 'orders') activeTab = 'brief';   // admin zaczyna dzień od briefu
  showTab(activeTab);
}
function showTab(t) {
  activeTab = t;
  $$('#panelTabs .tab').forEach((b) => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  $$('#panelIn [data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t));
  if (t === 'admin') withAdmin(() => loadAdmin());
  if (t === 'refs') loadRefs();
  if (t === 'account') renderAccount();
  if (t === 'programs') renderPrograms();
  if (t === 'guides') withAdmin(() => loadGuides());
  if (t === 'finance') withAdmin(() => loadFinance());
  if (t === 'prices') withAdmin(() => loadPrices());
  if (t === 'brief') withAdmin(() => loadBrief());
}
const ORDER_COLS = 'id,order_number,service_id,service_name,kind,status,express,base_grosze,discount_grosze,express_fee_grosze,total_grosze,amount_due_grosze,discount_code,referral_code_used,spec,handover,slot_conflict,created_at,paid_at,cancel_reason,calendar_slots(starts_at,ends_at,status,hold_expires_at),order_events(status,note,at),order_results(phase,metrics)';
const ORDER_COLS_V1 = 'id,order_number,service_id,service_name,kind,status,base_grosze,discount_grosze,total_grosze,amount_due_grosze,referral_code_used,slot_conflict,created_at,paid_at,cancel_reason,calendar_slots(starts_at,ends_at,status,hold_expires_at)';
let panelLoading = false, orders = [];
async function loadPanelData() {
  if (!session || !sb || panelLoading) return; panelLoading = true;
  try {
    let r = await sb.from('orders').select(cat.hasV2 ? ORDER_COLS : ORDER_COLS_V1).eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
    if (r.error && /column|relationship/.test(r.error.message)) r = await sb.from('orders').select(ORDER_COLS_V1).eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
    if (r.error) { log(`zamówienia: ${r.error.message}`); return; }
    orders = r.data; await loadMyReviews(orders); renderOrders();
    if (activeTab === 'admin') withAdmin(() => loadAdmin(true));
    if (activeTab === 'refs') loadRefs();
  } finally { panelLoading = false; }
}
const STEPS = [['OPLACONE', 'Przyjęte'], ['W_REALIZACJI', 'Realizacja'], ['TESTY', 'Testy i raport'], ['ZAKONCZONE', 'Zakończone']];
function renderOrders() {
  if (activeTab === 'programs') setTimeout(renderPrograms, 0);
  const box = $('#ordersList'); box.replaceChildren();
  if (!orders.length) { box.append(h('div', { class: 'empty' }, h('p', { text: 'Nie masz jeszcze zleceń.' }), h('a', { class: 'btn btn-gold btn-sm', href: '/rezerwacja', 'data-link': true, text: 'Zarezerwuj pierwszy termin' }))); return; }
  for (const o of orders) box.append(orderCard(o));
}
function holdLeft(slot) { return slot?.status === 'TRZYMANA' && slot.hold_expires_at ? Math.max(0, new Date(slot.hold_expires_at) - Date.now()) : 0; }
function orderCard(o) {
  const slot = o.calendar_slots?.[0]; const [label, tone] = STATUS[o.status] || [o.status, ''];
  const stepIdx = STEPS.findIndex(([s]) => s === o.status);
  const card = h('article', { class: 'order' },
    h('div', { class: 'order-h' },
      h('div', {}, h('h4', { text: o.service_name + (o.express ? ' + Express' : '') }), h('span', { class: 'order-num', text: o.order_number || 'numer nadamy po płatności' })),
      h('span', { class: `pill ${tone}`, text: label })),
    o.status !== 'ANULOWANE' && o.status !== 'OCZEKUJE_NA_PLATNOSC' ? h('div', { class: 'progress', 'aria-label': `Postęp: ${label}` }, STEPS.map(([, t], i) => h('div', { class: i <= stepIdx ? 'done' : '', text: t }))) : null,
    h('div', { class: 'kv' },
      h('div', {}, h('small', { text: 'Termin' }), slot ? `${fmt(slot.starts_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${hm(slot.starts_at)}–${hm(slot.ends_at)}` : '–'),
      h('div', {}, h('small', { text: 'Rezerwacja' }), slot ? (SLOT_STATUS[slot.status] || slot.status) : '–'),
      h('div', {}, h('small', { text: o.amount_due_grosze < o.total_grosze ? 'Zaliczka / razem' : 'Kwota' }), o.amount_due_grosze < o.total_grosze ? `${zl(o.amount_due_grosze)} / ${zl(o.total_grosze)}` : zl(o.total_grosze)),
      o.discount_grosze ? h('div', {}, h('small', { text: 'Rabat' }), `−${zl(o.discount_grosze)} (${o.discount_code || o.referral_code_used || 'kod'})`) : null,
      h('div', {}, h('small', { text: 'Złożone' }), fmt(o.created_at))));
  if (o.slot_conflict) card.append(h('div', { class: 'banner info', text: 'Termin został zajęty w trakcie księgowania płatności. Skontaktujemy się, żeby ustalić nową godzinę.' }));
  const spec = Object.entries(o.spec || {}).filter(([k]) => k !== 'Usługa');
  if (spec.length) card.append(h('ul', { class: 'sum-spec' }, spec.map(([k, v]) => h('li', { text: `${k}: ${v}` }))));
  const res = resultsTable(o.order_results || []); if (res) card.append(h('h4', { style: 'margin:14px 0 0;font-size:.95rem', text: 'Raport STRIKE PROOF – pomiary' }), res);
  const payActs = h('div');
  if (o.paid_at || o.status === 'OCZEKUJE_NA_PLATNOSC') card.append(clientBillBox(o, payActs));
  const files = h('div', { class: 'files' }); card.append(files);
  if (['OPLACONE', 'W_REALIZACJI', 'TESTY', 'ZAKONCZONE'].includes(o.status)) loadFiles(o, files);
  if (o.order_events?.length) card.append(h('details', { class: 'more' }, h('summary', { text: 'Historia zlecenia' }), h('ul', { class: 'timeline' }, [...o.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => h('li', {}, h('time', { text: fmt(e.at) }), (STATUS[e.status]?.[0] || e.status) + (e.note ? ` – ${e.note}` : ''))))));
  if (o.status === 'OCZEKUJE_NA_PLATNOSC') {
    const left = holdLeft(slot), timer = h('span', { class: 'hold-timer' });
    const tick = () => { const l = holdLeft(slot); timer.textContent = l ? `Termin czeka jeszcze ${Math.floor(l / 60000)}:${String(Math.floor(l / 1000) % 60).padStart(2, '0')}` : 'Rezerwacja wygasła'; if (!l) clearInterval(iv); };
    const iv = setInterval(() => { if (!card.isConnected) return clearInterval(iv); tick(); }, 1000); tick();
    const payB = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Dokończ płatność', disabled: !left, onclick: async () => { setBusy(payB, true); try { const d = await callFn('create-checkout', { resume_order_id: o.id }); location.href = d.url; } catch (e) { setBusy(payB, false, 'Dokończ płatność'); toast('err', e.message); loadPanelData(); } } });
    const cancelB = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Anuluj rezerwację', onclick: async () => { setBusy(cancelB, true); try { await callFn('cancel-checkout', { order_id: o.id }); toast('info', 'Rezerwacja anulowana, termin wrócił do kalendarza.'); } catch (e) { toast('err', e.message); } loadPanelData(); loadSlots(true); } });
    payActs.append(h('div', { class: 'order-actions' }, payB, cancelB, timer)); card.append(payActs);
  }
  if (o.status === 'ZAKONCZONE') card.append(reviewBox(o));
  return card;
}
function resultsTable(results) {
  const b = results.find((r) => r.phase === 'before')?.metrics || {}, a = results.find((r) => r.phase === 'after')?.metrics || {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])]; if (!keys.length) return null;
  if (REPmod) {
    return h('div', { class: 'scroll-x' }, h('table', { class: 'res' }, h('thead', {}, h('tr', {}, ['Pomiar', 'Przed', 'Po', 'Zmiana'].map((t) => h('th', { text: t })))),
      h('tbody', {}, keys.map((k) => {
        const inf = REPmod.metricInfo(k), ch = REPmod.change(k, b[k], a[k], inf), v = (x) => x === undefined ? '–' : `${String(x).replace('.', ',')}${inf.u && typeof x === 'number' ? ' ' + inf.u : ''}`;
        return h('tr', {}, h('td', { text: inf.l }), h('td', { text: v(b[k]) }), h('td', { text: v(a[k]) }), h('td', { class: ch?.good ? 'up' : ch?.good === false ? 'down' : '', text: ch?.text || '–' }));
      }))));
  }
  repModule().then(() => { if (activeTab === 'orders') renderOrders(); }).catch(() => {});
  const LBL = { fps_avg: 'FPS średnio', fps_1low: '1% low FPS', gpu_temp: 'Temp. GPU (°C)', cpu_temp: 'Temp. CPU (°C)', latency_ms: 'Opóźnienie (ms)', noise_db: 'Hałas (dB)', boot_s: 'Start systemu (s)' };
  const lowerBetter = (k) => /temp|latency|lag|noise|db|boot|time|_ms$|_s$/.test(k);
  return h('div', { class: 'scroll-x' }, h('table', { class: 'res' }, h('thead', {}, h('tr', {}, ['Pomiar', 'Przed', 'Po', 'Zmiana'].map((t) => h('th', { text: t })))),
    h('tbody', {}, keys.map((k) => {
      const x = b[k], y = a[k]; let d = '–', cls = '';
      if (typeof x === 'number' && typeof y === 'number' && x !== 0) { const p = Math.round((y - x) / Math.abs(x) * 1000) / 10; d = `${p > 0 ? '+' : ''}${p}%`; cls = (p > 0) !== lowerBetter(k) ? 'up' : p === 0 ? '' : 'down'; }
      return h('tr', {}, h('td', { text: LBL[k] || k.replace(/_/g, ' ') }), h('td', { text: x ?? '–' }), h('td', { text: y ?? '–' }), h('td', { class: cls, text: d }));
    }))));
}
/** Rachunek / faktura do zamówienia (Strefa Klienta) – PDF z plików zamówienia. Gdy rachunek czeka na wpłatę: dane do przelewu. */
function clientBillBox(o, payActs) {
  const box = h('div');
  if (!cat.hasV2) return box;
  sb.from('bills').select('id,kind,number,issued_on,total_grosze,client_path,sent_at,sent_to,paid_on,pay_title,pay_method,seller').eq('order_id', o.id).then(({ data, error }) => {
    if (error || !data?.length) return;
    const due = !o.paid_at ? data.find((b) => !b.paid_on && b.seller?.account) : null;
    if (due && payActs) payActs.replaceChildren();   // płatność przelewem / BLIK-iem zamiast Stripe
    box.replaceChildren(due ? transferBox(due) : null, ...data.map((b) => h('div', { class: 'bill-chip' },
      h('span', { class: 'bill-ico', 'aria-hidden': 'true', text: '🧾' }),
      h('div', { class: 'grow' }, h('b', { text: `${b.kind === 'faktura' ? 'Faktura' : 'Rachunek'} ${b.number}` }),
        h('div', { class: 'muted small', text: `${zl(b.total_grosze)} · ${fmt(`${b.issued_on}T12:00:00Z`, { dateStyle: 'medium' })}${b.paid_on ? ' · zapłacony' : ' · czeka na wpłatę'}${b.sent_at ? ` · wysłany na ${b.sent_to}` : ''}` })),
      b.client_path ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Pobierz PDF', onclick: async () => {
        const { data: u, error: e } = await sb.storage.from('reports').createSignedUrl(b.client_path, 120);
        if (e) return toast('err', 'Nie udało się pobrać rachunku.'); window.open(u.signedUrl, '_blank', 'noopener');
      } }) : null)));
  });
  return box;
}
/** Dane do przelewu: odbiorca, numer konta, kwota i tytuł (numer rachunku + usługa) z przyciskami „Kopiuj”. */
function transferBox(b) {
  const copy = (txt, what) => navigator.clipboard?.writeText(txt).then(() => toast('ok', `Skopiowano ${what}.`), () => toast('err', 'Nie udało się skopiować – zaznacz tekst ręcznie.'));
  const row = (label, val, what) => h('div', { class: 'tr-row' }, h('small', { text: label }), h('b', { text: val }), what ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Kopiuj', 'aria-label': `Kopiuj: ${label}`, onclick: () => copy(val, what) }) : h('span'));
  const kw = (b.total_grosze / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return h('div', { class: 'transfer-box' },
    h('h5', { text: 'Dane do przelewu' }),
    h('p', { class: 'muted small', text: 'Płatność 100% z góry, przed wykonaniem usługi. Wpisz tytuł dokładnie tak, jak poniżej – po nim przypiszemy wpłatę do Twojego zlecenia.' }),
    row('Odbiorca', b.seller?.name || 'Strike Tech Lab'),
    row('Nr rachunku', b.seller.account, 'numer rachunku'),
    row('Kwota', `${kw} zł`, null),
    row('Tytuł przelewu', b.pay_title || b.number, 'tytuł przelewu'),
    b.pay_method === 'blik_tel' && b.seller?.blik_phone ? row('BLIK na telefon', b.seller.blik_phone, 'numer telefonu') : null,
    h('p', { class: 'muted small', style: 'margin:8px 0 0', text: b.pay_method === 'blik_tel' ? 'BLIK na telefon przyjmujemy tylko przy osobistym oddaniu sprzętu – z tym samym tytułem. Nie przyjmujemy gotówki.' : 'Nie przyjmujemy gotówki. Status zmieni się na „Opłacone”, gdy wpłata do nas dotrze (zwykle 1 dzień roboczy).' }));
}
const BILL_FILE_RE = /-(Rachunek|Faktura)-[RF]-\d+-\d{4}\.pdf$/;
async function loadFiles(o, box, ownerId) {
  const folder = `${ownerId || session.user.id}/${o.id}`;
  const { data } = await sb.storage.from('reports').list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
  box.replaceChildren(...(data || []).filter((f) => f.name && !f.name.startsWith('.') && !BILL_FILE_RE.test(f.name)).map((f) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: `⬇ ${f.name.replace(/^\d{10,}-/, '')}`, 'aria-label': `Pobierz plik ${f.name.replace(/^\d{10,}-/, '')}`,
    onclick: async () => { const { data: s, error } = await sb.storage.from('reports').createSignedUrl(`${folder}/${f.name}`, 120); if (error) return toast('err', 'Nie udało się pobrać pliku.'); window.open(s.signedUrl, '_blank', 'noopener'); } })));
}
async function loadRefs() {
  const box = $('#refsOut'); if (!session) return;
  const code = profile?.referral_code || '…', link = `${SITE_URL}rezerwacja?ref=${encodeURIComponent(code)}`;
  const [r, d] = await Promise.all([sb.from('referrals').select('referrer_id,referred_id,code,discount_grosze,reward_grosze,status,reward_available_at,created_at').order('created_at', { ascending: false }),
    cat.hasV2 ? sb.from('discount_codes').select('code,pct,cap_grosze,valid_to,kind,max_uses').eq('owner_id', session.user.id) : Promise.resolve({ data: [] })]);
  const mine = (r.data || []).filter((x) => x.referrer_id === session.user.id), used = (r.data || []).find((x) => x.referred_id === session.user.id);
  const usedCodes = new Set(orders.filter((o) => o.status !== 'ANULOWANE').map((o) => o.discount_code).filter(Boolean));
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('ok', 'Skopiowano.'); } catch { toast('info', t, 12000); } };
  box.replaceChildren(h('div', { class: 'grid g2' },
    h('div', { class: 'card hud' }, h('h3', { text: 'Twój kod polecający' }), h('p', { class: 'ref-code', text: code }),
      h('p', { class: 'muted', text: 'Znajomy (nowy klient) dostaje 10% rabatu, maks. 300 zł. Ty – jednorazowy kod na 5% po zakończeniu jego zlecenia i upływie 14 dni.' }),
      h('div', { class: 'cta-row', style: 'margin-top:8px' }, h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Kopiuj link polecający', onclick: () => copy(link) }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Kopiuj kod polecający', onclick: () => copy(code) }),
        navigator.share ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Udostępnij link polecający', onclick: () => navigator.share({ title: 'Strike Tech Lab', text: `Kod na 10% rabatu: ${code}`, url: link }).catch(() => {}) }) : null)),
    h('div', { class: 'card' }, h('h3', { text: 'Twoje kody rabatowe' }),
      (d.data || []).length ? h('ul', { class: 'check-list' }, d.data.map((c) => h('li', {}, h('b', { class: 'gold', text: c.code }), ` – ${c.pct}%${c.cap_grosze ? `, maks. ${zl(c.cap_grosze)}` : ''}${c.valid_to ? `, ważny do ${fmt(c.valid_to, { dateStyle: 'medium' })}` : ''}${usedCodes.has(c.code) ? ' (wykorzystany)' : ''}`)))
        : h('p', { class: 'muted', text: 'Kody-nagrody za polecenia pojawią się tutaj i w Twojej skrzynce mailowej.' }),
      used ? h('p', { class: 'note', text: `Skorzystałeś z kodu polecającego ${used.code} (−${zl(used.discount_grosze)}).` }) : null)),
  h('h3', { style: 'margin-top:26px', text: `Twoje polecenia (${mine.length})` }),
  mine.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'res' }, h('thead', {}, h('tr', {}, ['Data', 'Status', 'Nagroda', 'Dostępna od'].map((t) => h('th', { text: t })))),
    h('tbody', {}, mine.map((x) => h('tr', {}, h('td', { text: fmt(x.created_at, { dateStyle: 'medium' }) }), h('td', {}, h('span', { class: `pill ${REF_STATUS[x.status]?.[1] || ''}`, text: REF_STATUS[x.status]?.[0] || x.status })),
      h('td', { text: x.reward_grosze != null ? `${zl(x.reward_grosze)} (kod 5%)` : '–' }), h('td', { text: x.reward_available_at ? fmt(x.reward_available_at, { dateStyle: 'medium' }) : 'po zakończeniu zlecenia + 14 dni' }))))))
    : h('p', { class: 'muted', text: 'Nikt jeszcze nie użył Twojego kodu. Wyślij link znajomym.' }));
}
function renderAccount() {
  const box = $('#accountOut'); if (!session) return;
  const name = h('input', { class: 'input', id: 'pName', maxlength: 120, value: profile?.full_name || '' });
  const phone = h('input', { class: 'input', id: 'pPhone', type: 'tel', maxlength: 20, value: profile?.phone || '' });
  const mkt = h('input', { type: 'checkbox', id: 'pMkt' }); mkt.checked = !!profile?.marketing;
  const msg = h('div', { class: 'form-msg', role: 'status' });
  const save = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: 'Zapisz dane' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 200, id: 'pPass' });
  const confirmDel = h('input', { class: 'input', id: 'pDel', placeholder: 'wpisz: USUŃ', maxlength: 10 });
  box.replaceChildren(h('div', { class: 'grid g2' },
    h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); msg.className = 'form-msg';
      if (phone.value && !/^\+?[0-9 ]{7,20}$/.test(phone.value.trim())) { msg.className = 'form-msg err'; msg.textContent = 'Telefon: same cyfry i spacje, opcjonalnie + na początku.'; return; }
      setBusy(save, true);
      const upd = { full_name: name.value.trim() || null, phone: phone.value.trim() || null }; if (cat.hasV2) upd.marketing = mkt.checked;
      const { error } = await sb.from('profiles').update(upd).eq('id', session.user.id);
      setBusy(save, false, 'Zapisz dane');
      if (error) { msg.className = 'form-msg err'; msg.textContent = 'Nie udało się zapisać. Spróbuj ponownie.'; return; }
      Object.assign(profile, upd); msg.className = 'form-msg ok'; msg.textContent = 'Zapisano.'; renderPanel();
    } },
      h('h3', { text: 'Dane konta' }), h('p', { class: 'muted small', text: `E-mail: ${session.user.email}` }),
      h('div', { class: 'field' }, h('label', { for: 'pName', text: 'Imię i nazwisko' }), name),
      h('div', { class: 'field' }, h('label', { for: 'pPhone', text: 'Telefon' }), phone),
      cat.hasV2 ? h('label', { class: 'check' }, mkt, h('span', { text: 'Chcę otrzymywać e-mailem informacje o promocjach Strike Tech Lab (zgodę wycofasz w każdej chwili, odznaczając to pole).' })) : null,
      save, msg),
    h('div', {},
      linkedAccountsCard(),
      h('form', { class: 'card', style: 'margin-bottom:20px', onsubmit: async (e) => {
        e.preventDefault(); if (pass.value.length < 10) return toast('err', 'Hasło musi mieć co najmniej 10 znaków.');
        const { error } = await sb.auth.updateUser({ password: pass.value }); pass.value = '';
        error ? toast('err', AUTH_ERR(error.message)) : toast('ok', 'Hasło zmienione.');
      } }, h('h3', { text: 'Zmiana hasła' }), h('div', { class: 'field' }, h('label', { for: 'pPass', text: 'Nowe hasło (min. 10 znaków)' }), pass), h('button', { class: 'btn btn-ghost btn-sm', type: 'submit', text: 'Zmień hasło' })),
      h('div', { class: 'card' }, h('h3', { text: 'Twoje dane (RODO)' }),
        h('p', { class: 'muted small', text: 'Możesz pobrać wszystkie dane konta albo usunąć konto. Dane zamówień zachowujemy tylko w zakresie wymaganym przepisami (np. księgowymi).' }),
        h('div', { class: 'cta-row', style: 'margin:10px 0 16px' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Pobierz moje dane (JSON)', onclick: async (e) => { const b = e.currentTarget; setBusy(b, true); try { const d = await callFn('account', { action: 'export' }); download('strike-tech-lab-moje-dane.json', JSON.stringify(d, null, 2), 'application/json'); } catch (err) { toast('err', err.message); } setBusy(b, false, 'Pobierz moje dane (JSON)'); } }),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Wyloguj się', onclick: () => sb.auth.signOut() })),
        h('div', { class: 'field' }, h('label', { for: 'pDel', text: 'Usunięcie konta jest trwałe' }), confirmDel),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Usuń konto', onclick: async (e) => {
          if (confirmDel.value.trim().toUpperCase() !== 'USUŃ') return toast('err', 'Wpisz USUŃ, żeby potwierdzić.');
          const b = e.currentTarget; setBusy(b, true);
          try { await callFn('account', { action: 'delete' }); toast('ok', 'Konto zostało usunięte.'); await sb.auth.signOut(); }
          catch (err) { toast('err', err.message); if (err.code === 'REAUTH') { await sb.auth.signOut(); openAuth('login', 'Zaloguj się ponownie, a potem od razu usuń konto.'); } }
          setBusy(b, false, 'Usuń konto');
        } })))));
}

/* ------------------------------------------------------------------ programy do usług (Strefa Klienta) */
const SOFT = {
  rustdesk: { name: 'RustDesk', url: 'https://rustdesk.com/', what: 'Darmowy program do połączenia zdalnego z szyfrowaniem end-to-end – przez niego pracujemy na Twoim komputerze. Sam akceptujesz połączenie, widzisz wszystko na żywo i możesz przerwać w każdej chwili.' },
  hwinfo: { name: 'HWiNFO64', url: 'https://www.hwinfo.com/download/', what: 'Odczyt czujników: temperatury, zegary, napięcia. Na tej podstawie robimy pomiar przed i po.' },
  afterburner: { name: 'MSI Afterburner', url: 'https://www.msi.com/Landing/afterburner/graphics-cards', what: 'Undervolting karty graficznej, krzywa wentylatorów i licznik FPS w grze.' },
  occt: { name: 'OCCT', url: 'https://www.ocbase.com/download', what: 'Testy stabilności po zmianach (procesor, karta, zasilanie).' },
  capframex: { name: 'CapFrameX', url: 'https://www.capframex.com/download', what: 'Dokładny pomiar FPS, 1% low i czasu klatki – liczby do raportu STRIKE PROOF.' },
  gpudriver: { name: 'Sterownik karty graficznej', url: 'https://www.nvidia.com/pl-pl/software/nvidia-app/', alt: ['AMD Software', 'https://www.amd.com/pl/support/download/drivers.html'], what: 'Aktualny sterownik: NVIDIA App (karty GeForce) albo AMD Software (karty Radeon).' },
};
SOFT.anydesk = SOFT.rustdesk;   // zgodność ze starszymi wpisami
const PROGRAMS = [
  { id: 'strike-precision-tune', need: ['rustdesk'], during: ['hwinfo', 'afterburner', 'occt', 'capframex'], prep: ['Zaktualizuj Windows i zrestartuj komputer dzień przed sesją.', 'Zainstaluj 1–2 gry, na których mamy mierzyć FPS.'] },
  { id: 'strike-zero-latency', need: ['rustdesk', 'gpudriver'], during: ['hwinfo', 'capframex', 'occt'], prep: ['Miej pod ręką dostęp do BIOS-u (bez hasła albo z hasłem, które podasz na sesji).', 'Podłącz komputer kablem do routera – zmiany sieciowe testujemy na żywo.', 'Przygotuj grę, w której opóźnienia przeszkadzają Ci najbardziej.'] },
  { id: 'strike-overhaul', need: [], during: ['hwinfo', 'occt'], prep: ['Zrób kopię ważnych danych.', 'Zapisz klucz BitLocker, jeśli szyfrujesz dysk.'] },
  { id: 'strike-custom-assembly', need: [], during: ['hwinfo', 'occt'], prep: ['Dostarcz wszystkie części razem z pudełkami i akcesoriami (śrubki, kable, zaślepki).', 'Jeśli masz licencję Windows, przygotuj klucz albo konto Microsoft.'] },
  { id: 'strike-thermal-shield', need: [], during: ['hwinfo', 'occt'], prep: ['Zrób kopię ważnych danych.', 'Zanotuj, kiedy komputer jest najgłośniejszy (gra, render) – odtworzymy to w testach.'] },
  { id: 'strike-revival', need: [], during: ['hwinfo'], prep: ['Opisz objawy: kiedy się zaczęły, co robiłeś tuż przed awarią, czy są sygnały dźwiękowe.', 'Jeśli komputer się uruchamia, zrób kopię danych.'] },
  ...['strike-web-start', 'strike-web-landing', 'strike-web-business', 'strike-web-pro', 'strike-web-shop', 'strike-business-web'].map((id) => ({ id, need: [], during: [], prep: ['Przygotuj logo, teksty i zdjęcia (albo listę, czego brakuje).', 'Dostęp do panelu domeny i hostingu, jeśli już je masz.'], note: 'Do projektu strony nie musisz nic instalować – pracujemy na naszych narzędziach i wysyłamy podgląd.' })),
  ...['strike-auto-start', 'strike-auto-flow', 'strike-auto-system', 'strike-smart-automation'].map((id) => ({ id, need: [], during: [], prep: ['Lista procesów do automatyzacji i przykładowe pliki (np. eksport z arkusza).', 'Dostęp do kont, które mają się łączyć (np. Google Workspace) – nadasz go w trakcie wdrożenia.'], note: 'Narzędzia dobieramy do Twoich systemów – nic nie instalujesz przed rozmową startową.' })),
];
const GENERAL_PREP = ['Zrób kopię ważnych danych (zdjęcia, dokumenty, zapisy gier).', 'Zamknij zbędne programy i podłącz komputer do stabilnego internetu (najlepiej kablem).', 'ID i hasło jednorazowe RustDesk podawaj dopiero w umówionym terminie, osobie z naszego zespołu.', 'Miej pod ręką konto Windows z uprawnieniami administratora i klucz BitLocker, jeśli go używasz.', 'Nigdy nie podawaj nam haseł do banku ani kont prywatnych.'];
let progSel = '';
function renderPrograms() {
  const out = $('#programsOut'); if (!out) return;
  const mine = [...new Set(orders.filter((o) => !['ANULOWANE', 'ZAKONCZONE'].includes(o.status)).map((o) => o.service_id))];
  const avail = PROGRAMS.filter((p) => cat.services.has(p.id) || SVC[p.id]);
  if (!progSel || !avail.some((p) => p.id === progSel)) progSel = mine.find((id) => avail.some((p) => p.id === id)) || avail[0]?.id;
  const softRow = (k, required) => {
    const x = SOFT[k];
    return h('li', { class: 'soft' },
      h('div', {}, h('b', { text: x.name }), required ? h('span', { class: 'pill', text: 'Zainstaluj przed terminem' }) : h('span', { class: 'pill ghost', text: 'Zainstalujemy w trakcie' }), h('p', { class: 'muted small', text: x.what })),
      h('div', { class: 'soft-links' }, h('a', { class: `btn ${required ? 'btn-gold' : 'btn-ghost'} btn-sm`, href: x.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${x.alt ? 'Pobierz sterownik NVIDIA' : `Pobierz ${x.name}`} (strona producenta, nowa karta)`, text: x.alt ? 'NVIDIA' : 'Pobierz' }),
        x.alt ? h('a', { class: `btn ${required ? 'btn-gold' : 'btn-ghost'} btn-sm`, href: x.alt[1], target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Pobierz sterownik AMD (strona producenta, nowa karta)', text: 'AMD' }) : null));
  };
  const p = avail.find((x) => x.id === progSel);
  const name = (id) => svcOf(id)?.name || nameOf(id);
  out.replaceChildren(
    h('div', { class: 'prog-pick' }, h('label', { for: 'progSvc', text: 'Usługa' }),
      h('select', { class: 'select', id: 'progSvc', onchange: (e) => { progSel = e.target.value; renderPrograms(); } },
        avail.map((x) => h('option', { value: x.id, selected: x.id === progSel, text: `${name(x.id)}${mine.includes(x.id) ? ' · Twoje zlecenie' : ''}` })))),
    p ? h('div', { class: 'grid g2 prog-grid' },
      h('div', { class: 'card' }, h('h3', { text: 'Programy' }),
        p.need.length || p.during.length ? h('ul', { class: 'soft-list' }, p.need.map((k) => softRow(k, true)), p.during.map((k) => softRow(k, false)))
          : h('p', { class: 'muted', text: p.note || 'Do tej usługi nie musisz nic instalować.' }),
        p.need.length ? null : (p.during.length ? h('p', { class: 'note', text: 'Usługa warsztatowa: programy do testów instalujemy sami, a po odbiorze możesz je zostawić albo usunąć.' }) : null)),
      h('div', { class: 'card' }, h('h3', { text: 'Przygotowanie' }),
        h('ul', { class: 'check-list' }, p.prep.map((t) => h('li', { text: t }))),
        p.need.includes('anydesk') ? h('details', { class: 'parts-more' }, h('summary', { text: 'Zasady sesji zdalnej' }), h('ul', { class: 'check-list' }, GENERAL_PREP.map((t) => h('li', { text: t })))) : null)) : null);
}

/* ------------------------------------------------------------------ Strike Advisor – asystent na stronie
   Odpowiedzi z gotowej bazy (słowa kluczowe), ceny na żywo z cennika. Bez zewnętrznych usług:
   wiadomości nie wychodzą z przeglądarki i nie są nigdzie zapisywane. */
const ADV = { started: false, panel: null, fab: null, body: null, input: null };
const advNorm = (s) => ' ' + String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const advSvc = (id) => svcOf(id) || (SVC[id] ? { id, name: nameOf(id), price_grosze: SVC[id].price } : null);
const advName = (id) => advSvc(id)?.name || nameOf(id);
const advPrice = (id) => { const s = advSvc(id); return s ? `od ${zl(s.price_grosze)}${SVC[id]?.fromLabel ? ' ' + SVC[id].fromLabel : ''}` : ''; };
const advSvcLi = (id, why) => h('li', {}, h('b', { text: advName(id) }), ` – ${advPrice(id)}${why ? `. ${why}` : ''}`);
const advLink = (text, to) => h('a', { href: to, text, onclick: (e) => { e.preventDefault(); const [path, q] = to.split('?'); navigate(path); const k = new URLSearchParams(q || '').get('kategoria'); if (k) { showCat(k); $('#svcCats')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } if (matchMedia('(max-width: 640px)').matches) advClose(); } });
const advLegal = (text, key) => h('button', { type: 'button', class: 'link', text, onclick: () => openLegal(key) });
const advP = (...k) => h('p', {}, ...k);
const advUl = (...li) => h('ul', {}, ...li);

const ADV_LABELS = {
  prices: 'Cennik', optim: 'Więcej FPS / mniejszy lag', heat: 'Głośny lub gorący PC', repair: 'Komputer nie działa',
  build: 'Złożenie komputera', sets: 'Zestawy PC', web: 'Strony WWW i automatyzacja', remote: 'Jak wygląda sesja zdalna',
  pay: 'Płatność', when: 'Terminy i Express', returns: 'Reklamacje i zwroty', refs: 'Rabaty i polecenia',
  status: 'Moje zlecenie', contact: 'Kontakt z człowiekiem', menu: '↩ Menu',
};
const ADV_MAIN = ['prices', 'optim', 'heat', 'repair', 'sets', 'remote', 'pay', 'contact'];
const ADV_INTENTS = [
  { id: 'hello', k: ['czesc', 'hej', 'witam', 'witaj', 'dzien dobry', 'siema', 'elo', 'hello', 'halo'], o: ADV_MAIN,
    a: () => [advP('Cześć! Jestem Strike Advisor – automatyczny asystent Strike Tech Lab. Podpowiem, która usługa pasuje do Twojego problemu, ile kosztuje i jak zarezerwować termin.'), advP('Wybierz temat albo napisz pytanie, np. „laguje mi CS2” albo „komputer za 7000”.')] },
  { id: 'menu', k: ['menu', 'start', 'pomoc', 'help', 'opcje', 'tematy'], o: ADV_MAIN, a: () => [advP('W czym pomóc? Wybierz temat albo napisz własnymi słowami.')] },
  { id: 'prices', k: ['cennik', 'cena', 'ceny', 'ile kosztuje', 'koszt', 'ile placi', 'za ile', 'drogo', 'tanio', 'pln', 'zl'], o: ['optim', 'heat', 'sets', 'pay'],
    a: () => {
      const ids = Object.keys(SVC).filter((id) => advSvc(id) && !isHiddenService(advSvc(id)));
      return [advP('Aktualny cennik (ceny końcowe bez VAT, płatność online z góry):'), advUl(...ids.map((id) => advSvcLi(id))), advP('Opcja Express przy wybranych usługach zdalnych: +50 zł. Szczegóły i zakres każdej usługi: ', advLink('Usługi i ceny →', '/uslugi'))];
    } },
  { id: 'optim', k: ['fps', 'laguje', 'lag', 'lagi', 'zacina', 'przycina', 'stuttering', 'input lag', 'opoznienie', 'opoznienia', 'latency', 'ping', 'wydajnosc', 'optymalizacja', 'optymalizacje', 'przyspieszyc', 'wolny', 'tuning', 'cs2', 'valorant', 'fortnite', 'warzone', 'apex', 'esport', 'e sport', 'reflex', 'bios', 'xmp', 'expo', 'ram'], o: ['remote', 'when', 'prices'],
    a: () => [advP('Do gier i opóźnień są dwie usługi zdalne:'), advUl(advSvcLi('strike-zero-latency', 'Pod e-sport: system, sterowniki, BIOS i RAM, ustawienia pod najniższy input lag'), advSvcLi('strike-precision-tune', 'Undervolting CPU i GPU: chłodniej i ciszej bez utraty wydajności')),
      advP('Przed zmianami i po nich mierzymy FPS, 1% low i temperatury – wynik dostajesz w raporcie STRIKE PROOF. Nie obiecujemy z góry konkretnego wzrostu, bo zależy on od sprzętu.'), advP(advLink('Zarezerwuj termin →', '/rezerwacja'))] },
  { id: 'heat', k: ['grzeje', 'goracy', 'gorace', 'temperatura', 'temperatury', 'przegrzewa', 'glosny', 'halasuje', 'szumi', 'wentylator', 'wiatrak', 'kurz', 'czyszczenie', 'wyczyscic', 'pasta', 'pady', 'throttling'], o: ['repair', 'prices', 'when'],
    a: () => [advP('Gorący i głośny komputer najczęściej potrzebuje czyszczenia i nowej pasty. Te usługi robimy warsztatowo (osobiście lub kurierem):'), advUl(advSvcLi('strike-overhaul', 'Przegląd, czyszczenie, pasta i pady'), advSvcLi('strike-thermal-shield', 'Głębsza regeneracja chłodzenia i przepływu powietrza')),
      advP('Jeśli głośna jest głównie karta w grach, pomoże też zdalny ', h('b', { text: advName('strike-precision-tune') }), ` (${advPrice('strike-precision-tune')}).`), advP(advLink('Zarezerwuj termin →', '/rezerwacja'))] },
  { id: 'repair', k: ['nie dziala', 'nie wlacza', 'nie startuje', 'nie uruchamia', 'zepsul', 'zepsuty', 'awaria', 'naprawa', 'naprawic', 'restartuje', 'resetuje', 'bluescreen', 'blue screen', 'bsod', 'artefakty', 'czarny ekran', 'piszczy', 'spalil', 'diagnoza', 'diagnostyka'], o: ['contact', 'prices', 'when'],
    a: () => [advP('Do awarii jest ', h('b', { text: advName('strike-revival') }), ` – ${advPrice('strike-revival')}. Sprawdzamy zasilanie, płytę, RAM, kartę i dyski, a potem dostajesz pisemną diagnozę z kosztorysem. Naprawiamy dopiero po Twojej akceptacji.`),
      advP('Jeśli na dysku są ważne dane, napisz o tym przy zgłoszeniu – zabezpieczamy je w pierwszej kolejności.'), advP(advLink('Zgłoś sprzęt →', '/rezerwacja'))] },
  { id: 'build', k: ['zlozyc', 'zlozenie', 'skladanie', 'montaz', 'zmontowac', 'czesci', 'podzespoly', 'mam czesci'], o: ['sets', 'prices', 'when'],
    a: () => [advP('Masz już części? ', h('b', { text: advName('strike-custom-assembly') }), ` – ${advPrice('strike-custom-assembly')}: sprawdzenie kompatybilności, montaż, BIOS, cable management i testy stabilności, plus 3 miesiące gwarancji na montaż.`),
      advP('Nie masz części? Dobierzemy je do Twojego budżetu – zobacz przykładowe ', advLink('zestawy PC →', '/zestawy'), ' albo napisz, ile chcesz wydać, np. „komputer za 6000”.')] },
  { id: 'sets', k: ['zestaw', 'zestawy', 'komputer do gier', 'pc do gier', 'jaki komputer', 'nowy komputer', 'kupic komputer', 'gaming', 'gamingowy', 'konfiguracja', 'polecasz komputer'], o: ['build', 'pay', 'contact'],
    a: () => [advP('Nasze zestawy są poglądowe – komputer składamy po rozmowie, w Twoim budżecie. Przykłady (wartość części, złożenie od ' + zl(ASSEMBLY_GROSZE) + '):'),
      advUl(...SETS.map((m) => h('li', {}, h('b', { text: m.name }), ` – ${m.kicker}, ok. ${zl(m.parts_grosze)}`))),
      advP('Napisz swój budżet, np. „komputer za 7000”, albo ', advLink('zobacz zestawy →', '/zestawy'))] },
  { id: 'web', k: ['strona', 'strony', 'www', 'witryna', 'sklep internetowy', 'automatyzacja', 'automatyzacje', 'firma', 'firmy', 'crm', 'arkusz', 'n8n', 'make'], o: ['prices', 'contact'],
    a: () => [advP('Dla firm:'), advUl(advSvcLi('strike-web-start', 'Wizytówka na jednej stronie'), advSvcLi('strike-web-business', 'Strona firmowa do 6 podstron'), advSvcLi('strike-web-shop', 'Sklep internetowy'), advSvcLi('strike-auto-start', 'Jedna automatyzacja'), advSvcLi('strike-auto-flow', 'Pakiet do 3 procesów')), advP('Najpierw bezpłatna wycena na piśmie, potem płatność z góry. ', advLink('Zobacz wszystkie pakiety →', '/uslugi?kategoria=solutions'))] },
  { id: 'remote', k: ['zdalnie', 'zdalna', 'zdalnej', 'anydesk', 'sesja', 'jak to wyglada', 'przygotowac', 'przygotowanie', 'programy', 'na odleglosc'], o: ['optim', 'when', 'pay'],
    a: () => [advP('Optymalizacje robimy zdalnie przez RustDesk (darmowy, szyfrowany) – widzisz wszystko na swoim ekranie i możesz przerwać w każdej chwili. Przed zmianami tworzymy punkt przywracania, a każdą zmianę zapisujemy, więc da się ją cofnąć.'),
      advP('Co zainstalować i jak się przygotować do konkretnej usługi, znajdziesz po zalogowaniu: ', advLink('Strefa Klienta → Programy →', '/konto')), advP('Nigdy nie podawaj nam haseł do banku ani kont prywatnych.')] },
  { id: 'pay', k: ['platnosc', 'platnosci', 'zaplacic', 'placic', 'blik', 'karta', 'karte', 'przelew', 'przelewy24', 'stripe', 'zaliczka', 'zaliczke', 'z gory', 'raty'], o: ['when', 'returns', 'refs'],
    a: () => [advP('Płacisz online 100% z góry przy rezerwacji – kartą, BLIK-iem albo Przelewy24 (zależnie od dostępności), przez operatora Stripe. Nie pobieramy zaliczek. Gotówki nie przyjmujemy.'), advP('Strony i automatyzacje opłacasz przelewem po akceptacji wyceny – dostajesz rachunek z numerem konta i gotowym tytułem przelewu (widać go też w Strefie Klienta).'), advP('Przy komputerze na zamówienie najpierw dostajesz bezpłatną wycenę mailem, a płacisz dopiero po jej akceptacji.')] },
  { id: 'when', k: ['termin', 'terminy', 'kiedy', 'godziny', 'otwarte', 'czynne', 'kalendarz', 'dzisiaj', 'jutro', 'weekend', 'sobota', 'express', 'ekspres', 'pilne', 'szybko'], o: ['pay', 'remote', 'prices'],
    a: () => [advP('Pracujemy od poniedziałku do piątku, 9:00–18:00. Wolne godziny widzisz w kalendarzu przy rezerwacji, a termin trzymamy dla Ciebie 35 minut na płatność.'),
      advP('Express (+50 zł) przy usługach zdalnych skraca minimalny czas do terminu do 2 godzin – o ile są wolne godziny.'), advP(advLink('Wybierz termin →', '/rezerwacja'))] },
  { id: 'returns', k: ['reklamacja', 'reklamacje', 'reklamowac', 'zwrot', 'zwroty', 'oddac', 'odstapienie', 'odstapic', 'rezygnacja', 'zrezygnowac', 'anulowac', 'gwarancja', 'gwarancji', 'regulamin'], o: ['pay', 'contact'],
    a: () => [advP('Konsument może odstąpić od umowy zawartej na odległość w ciągu 14 dni – szczegóły i wyjątki są w pouczeniu. Na reklamacje odpowiadamy w ciągu 14 dni.'),
      advP(advLegal('Zwroty i reklamacje', 'returns'), ' · ', advLegal('Odstąpienie od umowy', 'withdrawal'), ' · ', advLegal('Regulamin', 'terms'))] },
  { id: 'refs', k: ['rabat', 'rabaty', 'znizka', 'promocja', 'promocje', 'kod', 'kupon', 'polecenie', 'polecenia', 'polecic', 'taniej'], o: ['prices', 'pay'],
    a: () => [advP('Program poleceń: nowy klient z kodem polecającym dostaje 10% rabatu (maks. 300 zł), a polecający – kod na 5% po zakończeniu zlecenia. Swój kod znajdziesz w Strefie Klienta.'), advP(advLegal('Zasady programu poleceń', 'referral'), ' · ', advLink('Strefa Klienta →', '/konto'))] },
  { id: 'status', k: ['status', 'moje zlecenie', 'moje zamowienie', 'zamowienie', 'stl', 'raport', 'wynik', 'wyniki', 'konto', 'zalogowac', 'logowanie', 'haslo'], o: ['contact', 'menu'],
    a: () => [advP('Status zlecenia, raport STRIKE PROOF z pomiarami i zdjęcia sprzętu znajdziesz w Strefie Klienta – zmieniają się na żywo.'), advP(advLink('Przejdź do Strefy Klienta →', '/konto'))] },
  { id: 'privacy', k: ['rodo', 'dane osobowe', 'prywatnosc', 'cookies', 'ciasteczka', 'czy zapisujesz', 'czy jestes ai', 'jestes botem', 'bot', 'czlowiek', 'sztuczna inteligencja', 'ai'], o: ['contact', 'menu'],
    a: () => [advP('Jestem automatycznym asystentem z gotowymi odpowiedziami przygotowanymi przez nasz zespół – nie jestem człowiekiem. To, co piszesz w zakładce Asystent, nie jest nigdzie wysyłane ani zapisywane. Zakładka Wiadomości to prywatny czat z naszym zespołem – po zalogowaniu.'), advP('W sprawach indywidualnych odpowiada człowiek: ', advLink('formularz kontaktowy →', '/kontakt'), ' · ', advLegal('Polityka Prywatności', 'privacy'))] },
  { id: 'contact', k: ['kontakt', 'napisac', 'napisz', 'mail', 'email', 'e mail', 'telefon', 'zadzwonic', 'numer', 'czlowiekiem', 'konsultant', 'pracownik', 'adres'], o: ['menu'],
    a: () => [advP('Napisz do nas przez formularz – opisz sprzęt i problem, a odpowie człowiek: ', advLink('Kontakt →', '/kontakt')), advP('E-mail: ', h('a', { href: `mailto:${CFG.CONTACT_EMAIL}`, text: CFG.CONTACT_EMAIL }), CO.PHONE ? ` · tel. ${CO.PHONE}` : '')] },
  { id: 'thanks', k: ['dzieki', 'dziekuje', 'dziekowac', 'thx', 'thanks', 'super', 'spoko', 'git'], o: ADV_MAIN, a: () => [advP('Proszę bardzo! Jeśli masz kolejne pytanie, pisz śmiało.')] },
];
const ADV_FALLBACK = { id: 'fallback', o: ADV_MAIN, a: () => [advP('Nie jestem pewien, czy dobrze rozumiem. Spróbuj krócej, np. „FPS”, „głośny komputer”, „cena”, „komputer za 6000” – albo wybierz temat poniżej.'), advP('Możesz też ', advLink('napisać do nas →', '/kontakt'))] };

/* „komputer za 7000”, „budżet 6k”, „mam 5 tys” → najbliższy zestaw poglądowy */
function advBudget(t) {
  if (!/(komputer|zestaw|pc|budzet|wydac|mam)/.test(t)) return null;
  const m = t.match(/(\d{1,2})\s?(k|tys)\b|(\d[\d ]{2,6})/); if (!m) return null;
  const zlv = m[1] ? +m[1] * 1000 : +m[3].replace(/\s/g, '');
  if (!(zlv >= 1000 && zlv <= 100000)) return null;
  return { id: 'budget', o: ['sets', 'pay', 'contact'], a: () => {
    const fit = SETS.filter((s) => setTotal(s) <= zlv * 100).pop();
    if (!fit) return [advP(`Za ${zl(zlv * 100)} trudno o nowy zestaw z naszych przykładów – najtańszy, ${SETS[0].name}, to ok. ${zl(setTotal(SETS[0]))} razem ze złożeniem. Napisz, czego potrzebujesz, a zaproponujemy najlepsze, co się zmieści (np. używane części).`), advP(advLink('Bezpłatna wycena →', '/rezerwacja'))];
    return [advP(`W budżecie ${zl(zlv * 100)} mieści się np. `, h('b', { text: fit.name }), ` (${fit.kicker}) – części ok. ${zl(fit.parts_grosze)} + złożenie od ${zl(ASSEMBLY_GROSZE)}.`),
      advUl(...fit.parts.slice(0, 4).map(([k, v]) => h('li', { text: `${k}: ${v}` }))),
      advP('To przykład – ostateczny dobór części ustalamy z Tobą. Wycena jest bezpłatna i niczego nie wymaga. ', h('button', { type: 'button', class: 'link', text: 'Poproś o wycenę →', onclick: () => { pcRequest({ budget: zlv, inspiration: fit.name }); if (matchMedia('(max-width: 640px)').matches) advClose(); } }))];
  } };
}
function advDetect(text) {
  const t = advNorm(text);
  const b = advBudget(t); if (b) return b;
  let best = null, score = 0;
  for (const it of ADV_INTENTS) {
    let sc = 0;
    for (const k of it.k) if (k.length <= 3 ? t.includes(` ${k} `) : t.includes(k)) sc += k.length;
    if (sc > score) { score = sc; best = it; }
  }
  return best || ADV_FALLBACK;
}
function advScroll() { ADV.body.scrollTop = ADV.body.scrollHeight; }
function advMsg(who, kids) { const d = h('div', { class: `adv-msg ${who}` }, kids); ADV.body.append(d); advScroll(); return d; }
function advOpts(ids) {
  $$('.adv-opts', ADV.body).forEach((n) => n.remove());
  ADV.body.append(h('div', { class: 'adv-opts', role: 'group', 'aria-label': 'Podpowiedzi' }, ids.map((id) => h('button', { type: 'button', class: 'adv-opt', text: ADV_LABELS[id], onclick: () => advAsk(ADV_LABELS[id], id) }))));
  advScroll();
}
function advReply(it) {
  const typing = h('div', { class: 'adv-msg bot adv-typing', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  ADV.body.append(typing); advScroll();
  setTimeout(() => {
    typing.remove(); advMsg('bot', it.a());
    const o = [...(it.o || ADV_MAIN)]; if (!['menu', 'hello'].includes(it.id) && !o.includes('menu')) o.push('menu');
    advOpts(o);
  }, reduceMotion() ? 0 : 380);
}
function advAsk(text, id) {
  $$('.adv-opts', ADV.body).forEach((n) => n.remove());
  advMsg('me', [document.createTextNode(text)]);
  advReply(id ? (ADV_INTENTS.find((x) => x.id === id) || ADV_FALLBACK) : advDetect(text));
  // podpowiedź znika po kliknięciu – fokus wraca do pola (na telefonie nie, żeby nie wyskakiwała klawiatura)
  if (id && !matchMedia('(pointer: coarse)').matches) ADV.input.focus();
}
function advOpen() {
  ADV.panel.classList.add('open'); ADV.fab.setAttribute('aria-expanded', 'true'); ADV.panel.removeAttribute('hidden');
  // nieprzeczytana odpowiedź → od razu zakładka „Wiadomości”
  chatSetTab(CHAT.unread ? 'msgs' : CHAT.tab);
}
function advClose() { ADV.panel.classList.remove('open'); ADV.panel.setAttribute('hidden', ''); ADV.fab.setAttribute('aria-expanded', 'false'); ADV.fab.focus(); }
function initAdvisor() {
  if (ADV.panel) return;
  ADV.input = h('input', { type: 'text', class: 'adv-input', maxlength: '200', placeholder: 'Napisz pytanie, np. „laguje mi CS2”', 'aria-label': 'Twoje pytanie', autocomplete: 'off' });
  ADV.body = h('div', { class: 'adv-body', 'aria-live': 'polite' });
  ADV.panel = h('div', { class: 'adv-panel', id: 'advPanel', role: 'dialog', 'aria-label': 'Strike Advisor – asystent Strike Tech Lab', hidden: true },
    h('div', { class: 'adv-head' },
      h('div', { class: 'adv-avatar', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.2 2 4.5 13.4c-.4.5 0 1.2.6 1.2H10l-1.2 7.1c-.1.7.8 1.1 1.2.5L19 10.6c.4-.5 0-1.2-.6-1.2H14l1.1-6.3c.1-.7-.8-1.1-1.9-1.1Z"/></svg>' }),
      h('div', {}, h('b', { text: 'Strike Advisor' }), h('small', { text: 'Automatyczny asystent · odpowiada od razu' })),
      h('button', { type: 'button', class: 'adv-close', 'aria-label': 'Zamknij asystenta', text: '×', onclick: advClose })),
    ADV.body,
    h('form', { class: 'adv-form', onsubmit: (e) => { e.preventDefault(); const v = ADV.input.value.trim(); if (!v) return; ADV.input.value = ''; advAsk(v); } }, ADV.input, h('button', { type: 'submit', class: 'btn btn-gold btn-sm', text: 'Wyślij' })));
  ADV.fab = h('button', { type: 'button', class: 'adv-fab', 'aria-label': 'Otwórz asystenta Strike Advisor', 'aria-expanded': 'false', 'aria-controls': 'advPanel',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/></svg><span class="adv-ping" aria-hidden="true"></span>',
    onclick: () => (ADV.panel.classList.contains('open') ? advClose() : advOpen()) });
  document.body.append(ADV.panel, ADV.fab);
  chatMount();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ADV.panel.classList.contains('open') && !$('#legalModal')?.open) advClose(); });
}

/* ------------------------------------------------------------------ logowanie przez Google, Discord i inne (Supabase Auth)
   Przyciski pojawiają się tylko dla dostawców włączonych w Supabase → Authentication → Providers. */
const ICO = {
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"/><path fill="#4285F4" d="M21 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.3-2.2 3.1l3.4 2.6c2-1.8 2.3-4.6 2.3-8z"/><path fill="#FBBC05" d="M6.3 14.3c-.2-.7-.3-1.4-.3-2.2s.1-1.5.3-2.2L2.9 7.3C2.1 8.7 1.7 10.3 1.7 12s.4 3.3 1.2 4.7l3.4-2.4z"/><path fill="#34A853" d="M12 21.5c2.6 0 4.8-.9 6.4-2.3L15 16.6c-.9.6-2 1-3 1-2.6 0-4.8-1.7-5.6-4.1l-3.5 2.6C4.6 19.3 8 21.5 12 21.5z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12Z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1ZM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M4.3 1 1.5 4.7v15.1h5.1V23h2.8l3.1-3.2h4.2l5.8-5.8V1H4.3Zm16 12.1-3.3 3.3h-5.1l-2.9 2.9v-2.9H4.7V2.9h15.6v10.2Zm-3.2-6.4h-1.9v5.6h1.9V6.7Zm-5.1 0h-1.9v5.6H12V6.7Z"/></svg>',
  azure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
};
const OAUTH = { google: 'Google', discord: 'Discord', facebook: 'Facebook', apple: 'Apple', twitch: 'Twitch', azure: 'Microsoft' };
const OAUTH_SCOPES = { discord: 'identify email', azure: 'email' };
let oauthOn = [];
async function loadProviders(cfg) {
  try {
    const r = await fetch(cfg.url.replace(/\/+$/, '') + '/auth/v1/settings', { headers: { apikey: cfg.key } });
    const j = r.ok ? await r.json() : {};
    oauthOn = Object.keys(OAUTH).filter((p) => j?.external?.[p] === true);
  } catch { oauthOn = []; }
  renderSocial();
  if (route === '/konto' && session && activeTab === 'account') renderAccount();
}
function socialButtons(intent) {
  return oauthOn.map((p) => h('button', { type: 'button', class: 'btn btn-soc', 'data-prov': p, html: `${ICO[p]}<span>Kontynuuj z ${OAUTH[p]}</span>`, onclick: (e) => startOAuth(p, intent, e.currentTarget) }));
}
function renderSocial() {
  const any = oauthOn.length > 0;
  const box = $('#authSocialBtns'); if (box) box.replaceChildren(...socialButtons(''));
  $('#authSocial')?.classList.toggle('hidden', !any || !['login', 'register'].includes(authMode));
  const g = $('#gateSocial'); if (g) g.replaceChildren(...socialButtons(GATE.intent));
  $('#gateOr')?.classList.toggle('hidden', !any);
  $('#gateLegal')?.classList.toggle('hidden', !any);
}
async function startOAuth(provider, intent = '', btn = null) {
  if (!sb) { toast('err', 'Logowanie jest chwilowo niedostępne.'); return; }
  saveDraft(); if (intent) saveAuthReturn(intent); setRemember(true);
  if (btn) btn.disabled = true;
  const options = { redirectTo: SITE_URL + 'konto' };
  if (OAUTH_SCOPES[provider]) options.scopes = OAUTH_SCOPES[provider];
  const { error } = await sb.auth.signInWithOAuth({ provider, options });
  if (error) { if (btn) btn.disabled = false; toast('err', /not enabled|provider/i.test(error.message) ? `Logowanie przez ${OAUTH[provider]} nie jest jeszcze włączone.` : AUTH_ERR(error.message)); }
}

/* Okno „zaloguj się / załóż konto” – pokazuje się przy próbie rezerwacji (i czatu) bez logowania. */
const GATE = { intent: '' };
let authKnown = false;   // true po odczytaniu sesji – wcześniej nie blokujemy rezerwacji
function bookingLocked(path) { return authKnown && !!sb && !session && (path.replace(/\/+$/, '') || '/') === '/rezerwacja'; }
function askLogin(intent = 'booking', { title = '', text = '' } = {}) {
  const d = $('#authGate'); if (!d) { openAuth('login'); return; }
  GATE.intent = intent; saveDraft();
  $('#gateTitle').textContent = title || 'Zaloguj się, żeby zarezerwować';
  $('#gateText').textContent = text || 'Rezerwacja terminu i płatność są dostępne po zalogowaniu. Wybrana usługa i dane z formularza zostaną zachowane.';
  renderSocial();
  d.returnValue = '';
  if (!d.open) d.showModal();
  setTimeout(() => ($('#gateSocial button') || $('#gateLogin'))?.focus(), 30);
}
function bindGate() {
  const d = $('#authGate'); if (!d) return;
  const go = (mode) => {
    saveAuthReturn(GATE.intent); d.close('go');
    const hint = GATE.intent === 'chat' || GATE.intent === 'consult' ? 'Po zalogowaniu otworzy się czat – opisz sprzęt i problem.'
      : mode === 'register' ? 'Po założeniu konta i potwierdzeniu e-maila wrócisz do rezerwacji – Twój wybór czeka.' : 'Po zalogowaniu wrócisz do rezerwacji – Twój wybór czeka.';
    openAuth(mode, hint);
  };
  $('#gateLogin').addEventListener('click', () => go('login'));
  $('#gateRegister').addEventListener('click', () => go('register'));
  // zamknięte bez logowania na bezpośrednio otwartej rezerwacji → strona główna
  d.addEventListener('close', () => { if (d.returnValue !== 'go' && route === '/rezerwacja' && !session) navigate('/', { replace: true }); });
}

/* Konta Google / Discord zalogowanego klienta – kopiowane przez bazę z danych logowania. */
async function syncSocial() {
  const ids = session?.user?.identities || [];
  if (!sb || !ids.some((i) => i.provider === 'discord' || i.provider === 'google')) return;
  await sb.rpc('sync_social_accounts').then(() => {}, () => {});
}
function linkedAccountsCard() {
  if (!oauthOn.length || !session) return null;
  const ids = session.user.identities || [];
  const rows = oauthOn.map((p) => {
    const idn = ids.find((i) => i.provider === p);
    const who = idn ? (idn.identity_data?.custom_claims?.global_name || idn.identity_data?.full_name || idn.identity_data?.email || 'połączone') : '';
    const btn = idn
      ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Odłącz', disabled: ids.length < 2, title: ids.length < 2 ? 'To jedyny sposób logowania – najpierw ustaw hasło albo połącz inne konto.' : '', onclick: async (e) => {
        const b = e.currentTarget; setBusy(b, true);
        const { error } = await sb.auth.unlinkIdentity(idn);
        if (error) { setBusy(b, false, 'Odłącz'); toast('err', AUTH_ERR(error.message)); return; }
        await sb.auth.refreshSession(); session = (await sb.auth.getSession()).data.session || session;
        await syncSocial(); toast('ok', `Odłączono ${OAUTH[p]}.`); renderAccount();
      } })
      : h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Połącz', onclick: async (e) => {
        const b = e.currentTarget; setBusy(b, true);
        const options = { redirectTo: SITE_URL + 'konto' }; if (OAUTH_SCOPES[p]) options.scopes = OAUTH_SCOPES[p];
        const { error } = await sb.auth.linkIdentity({ provider: p, options });
        if (error) { setBusy(b, false, 'Połącz'); toast('err', /manual linking/i.test(error.message) ? 'Łączenie kont jest wyłączone w ustawieniach logowania (Supabase → Authentication → Allow manual linking).' : /already/i.test(error.message) ? `To konto ${OAUTH[p]} jest już przypięte do innego konta w serwisie.` : AUTH_ERR(error.message)); }
      } });
    return h('div', { class: 'linked-row' }, h('span', { class: 'ico', html: ICO[p] }),
      h('div', { class: 'grow' }, h('b', { text: OAUTH[p] }), h('small', { text: idn ? `Połączone: ${who}` : 'Niepołączone' })), h('span', { style: 'margin-left:auto' }, btn));
  });
  return h('div', { class: 'card', style: 'margin-bottom:20px' }, h('h3', { text: 'Logowanie przez Google / Discord' }),
    h('p', { class: 'muted small', text: 'Połącz konto, żeby logować się jednym kliknięciem. Po połączeniu Discorda widzimy Twoją nazwę użytkownika i możemy też skontaktować się z Tobą na Discordzie.' }),
    h('div', { class: 'linked' }, rows));
}

/* ------------------------------------------------------------------ czat z klientami (zakładka „Wiadomości” w okienku asystenta)
   Klient: jedna prywatna rozmowa z zespołem. Administrator (z 2FA): lista klientów, wyszukiwarka, odpowiedzi.
   Dostęp pilnuje baza (RLS) – nikt nie zobaczy cudzej rozmowy, nawet modyfikując stronę. */
const CHAT = { prefill: '', tab: 'bot', view: null, botView: null, tabs: {}, badge: null, sub: null,
  msgs: [], loadedFor: null, convId: null, unread: 0, inbox: [], q: '', sel: null, err: '', channel: null, sending: false, mounted: false };
const chatTime = (iso) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const chatDay = (iso) => {
  const d = new Date(iso), key = (x) => x.toLocaleDateString('pl-PL', { timeZone: TZ });
  const today = new Date(), y = new Date(Date.now() - 864e5);
  return key(d) === key(today) ? 'Dziś' : key(d) === key(y) ? 'Wczoraj' : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', timeZone: TZ });
};
const chatShort = (iso) => { const d = new Date(iso); return (Date.now() - d) < 864e5 && chatDay(iso) === 'Dziś' ? chatTime(iso) : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: TZ }); };
const chatErr = (e) => { const m = e?.message || String(e); return /function .*does not exist|Could not find the function|schema cache/i.test(m) ? 'Czat nie jest jeszcze włączony w bazie (migracja v17).' : /JWT|token/i.test(m) ? 'Sesja wygasła – odśwież stronę.' : m; };
const discordUrl = (id) => (/^\d{5,25}$/.test(String(id || '')) ? `https://discord.com/users/${id}` : '');

/* ------------------------------------------------------------------ zespół na czacie: Mikołaj i Dawid
   Okienka są widoczne dla każdego klienta (także przed zalogowaniem). Dane z tabeli team_members (migracja v22),
   a gdy jej jeszcze nie ma – z listy poniżej. Przy odpowiedzi na czacie widać, kto z zespołu odpisał. */
const TEAM_DEFAULT = [
  { slug: 'mikolaj', display_name: 'Mikołaj', role_label: 'Administrator', photo: 'media/zespol/mikolaj-avatar.webp', user_id: null },
  { slug: 'dawid', display_name: 'Dawid', role_label: 'Administrator', photo: null, user_id: null },
];
const TEAM = { list: TEAM_DEFAULT.map((x) => ({ ...x })), loaded: false, tried: 0 };
async function teamLoad() {
  if (!sb || TEAM.loaded || Date.now() - TEAM.tried < 60000) return;
  TEAM.tried = Date.now();
  const { data, error } = await sb.from('team_members').select('user_id,slug,display_name,role_label,photo,sort').eq('active', true).order('sort');
  if (error || !data?.length) return;                    // brak migracji v22 albo pusta tabela – zostają dane domyślne
  TEAM.loaded = true;
  const bySlug = new Map(TEAM_DEFAULT.map((x) => [x.slug, x]));
  TEAM.list = data.map((r) => ({ ...(bySlug.get(r.slug) || {}), ...r, photo: r.photo || bySlug.get(r.slug)?.photo || null }));
  $$('.chat-team').forEach((el) => el.replaceWith(chatTeamBar()));
  if (CHAT.list?.isConnected && CHAT.msgs.length) chatPaint();
}
const teamBySender = (id) => (id && TEAM.list.find((t) => t.user_id === id)) || null;
/** Godziny pracy: pn–pt 9:00–18:00 (czas polski). */
function teamOnline() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 9 && +p.hour < 18;
}
function teamAvatar(t, cls = 'team-av') {
  const el = h('span', { class: cls, 'aria-hidden': 'true' });
  if (t?.photo) {
    const img = h('img', { src: mediaUrl(t.photo.replace(/^media\//, '')), alt: '', loading: 'lazy', decoding: 'async', width: 64, height: 64 });
    img.addEventListener('error', () => { img.remove(); el.textContent = (t.display_name || '?')[0]; });
    el.append(img);
  } else el.textContent = (t?.display_name || 'S')[0];
  return el;
}
function chatTeamBar() {
  const on = teamOnline();
  return h('div', { class: 'chat-team', role: 'list', 'aria-label': 'Nasz zespół na czacie' },
    TEAM.list.slice(0, 2).map((t) => h('div', { class: 'team-card', role: 'listitem' },
      h('span', { class: 'team-ph' }, teamAvatar(t), h('i', { class: `team-dot${on ? ' on' : ''}`, 'aria-hidden': 'true' })),
      h('span', { class: 'team-txt' },
        h('b', { text: t.display_name }),
        h('span', { class: 'team-role', text: t.role_label || 'Administrator' }),
        h('small', { text: on ? 'Dostępny teraz' : 'Odpisze w dzień roboczy od 9:00' })))));
}
setInterval(() => { if (document.visibilityState === 'visible') $$('.chat-team').forEach((el) => el.replaceWith(chatTeamBar())); }, 300000);

function chatMount() {
  if (CHAT.mounted || !ADV.panel) return; CHAT.mounted = true;
  const head = ADV.panel.querySelector('.adv-head'), form = ADV.panel.querySelector('.adv-form');
  head.querySelector('b').textContent = 'Strike Tech Lab';
  CHAT.sub = head.querySelector('small');
  CHAT.botView = h('div', { class: 'adv-view' }); CHAT.botView.append(ADV.body, form);
  CHAT.view = h('div', { class: 'adv-view hidden', 'aria-live': 'polite' });
  const tab = (id, label) => h('button', { type: 'button', class: 'adv-tab', role: 'tab', 'aria-selected': 'false', onclick: () => chatSetTab(id) }, label);
  CHAT.tabs.bot = tab('bot', 'Asystent');
  CHAT.tabs.cnt = h('span', { class: 'cnt hidden' });
  CHAT.tabs.msgs = tab('msgs', ['Wiadomości', CHAT.tabs.cnt]);
  const tabs = h('div', { class: 'adv-tabs', role: 'tablist', 'aria-label': 'Asystent i wiadomości' }, CHAT.tabs.bot, CHAT.tabs.msgs);
  head.after(tabs); tabs.after(CHAT.botView, CHAT.view);
  ADV.panel.setAttribute('aria-label', 'Asystent i wiadomości Strike Tech Lab');
  ADV.fab.setAttribute('aria-label', 'Otwórz asystenta i wiadomości');
  CHAT.badge = h('span', { class: 'chat-badge hidden', 'aria-hidden': 'true' }); ADV.fab.append(CHAT.badge);
  chatSetTab(CHAT.tab, false);
  chatBadge();
}
function chatIsOpen() { return !!ADV.panel?.classList.contains('open') && CHAT.tab === 'msgs' && document.visibilityState === 'visible'; }
function chatSetTab(t, focus = true) {
  CHAT.tab = t;
  for (const k of ['bot', 'msgs']) { CHAT.tabs[k].setAttribute('aria-selected', String(k === t)); CHAT.tabs[k].tabIndex = k === t ? 0 : -1; }
  CHAT.botView.classList.toggle('hidden', t !== 'bot'); CHAT.view.classList.toggle('hidden', t !== 'msgs');
  CHAT.sub.textContent = t === 'bot' ? 'Automatyczny asystent · odpowiada od razu' : isAdmin ? 'Wiadomości od klientów' : 'Rozmowa z naszym zespołem';
  if (t === 'bot') { if (!ADV.started && ADV.panel.classList.contains('open')) { ADV.started = true; advReply(ADV_INTENTS[0]); } if (focus) setTimeout(() => ADV.input.focus(), 30); }
  else chatRender(focus);
}
function chatOpen(tab = 'msgs') {
  initAdvisor();
  ADV.panel.classList.add('open'); ADV.panel.removeAttribute('hidden'); ADV.fab.setAttribute('aria-expanded', 'true');
  chatSetTab(tab);
}
function chatBadge() {
  const n = CHAT.unread;
  if (CHAT.badge) { CHAT.badge.textContent = n > 9 ? '9+' : String(n); CHAT.badge.classList.toggle('hidden', !n); ADV.fab.classList.toggle('has-msg', !!n); }
  if (CHAT.tabs.cnt) { CHAT.tabs.cnt.textContent = n > 9 ? '9+' : String(n); CHAT.tabs.cnt.classList.toggle('hidden', !n); }
}

/* Bezpłatna konsultacja (15 min): czat z gotowym początkiem wiadomości; bez konta → okno logowania. */
const CONSULT_TEXT = 'Dzień dobry, chcę skorzystać z bezpłatnej konsultacji (15 min).\nSprzęt: \nProblem / co chcę osiągnąć: \nWolę rozmowę: tutaj na czacie / na Discordzie';
function startConsult() {
  if (!sb) { navigate('/kontakt'); return; }
  if (!session) { askLogin('consult', { title: 'Bezpłatna konsultacja – 15 minut', text: 'Zaloguj się albo załóż konto (wystarczy Google lub Discord) i opisz sprzęt na czacie. Doradzimy, zanim cokolwiek zamówisz – bez zobowiązań.' }); return; }
  if (isAdmin) { chatOpen('msgs'); return; }
  CHAT.prefill = CONSULT_TEXT; CHAT.loadedFor = CHAT.loadedFor || null;
  chatOpen('msgs');
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-consult]'); if (b) { e.preventDefault(); startConsult(); } });

/* --- widoki --- */
function chatEmpty(...kids) { return h('div', { class: 'chat-empty' }, kids); }
function chatRender(focus = false) {
  if (!CHAT.view || CHAT.view.classList.contains('hidden')) return;
  if (!sb) { CHAT.view.replaceChildren(chatEmpty(h('p', { text: 'Czat jest chwilowo niedostępny. Napisz przez formularz kontaktowy.' }))); return; }
  if (!session) {
    teamLoad();
    CHAT.view.replaceChildren(chatTeamBar(), chatEmpty(
      h('b', { text: 'Napisz do nas na czacie' }),
      h('span', { text: 'Wiadomości są prywatne – widzisz je tylko Ty i nasz zespół. Żeby pisać, zaloguj się albo załóż konto (wystarczy Google lub Discord).' }),
      h('button', { type: 'button', class: 'btn btn-gold btn-sm', text: 'Zaloguj się, żeby napisać', onclick: () => askLogin('chat', { title: 'Zaloguj się, żeby napisać', text: 'Rozmowa jest prywatna i zostaje na Twoim koncie – odpowiemy, nawet gdy zamkniesz stronę.' }) }),
      h('button', { type: 'button', class: 'link', text: 'Mam szybkie pytanie – zapytam asystenta', onclick: () => chatSetTab('bot') })));
    return;
  }
  if (isAdmin) { CHAT.sel ? chatThreadView(focus) : chatInboxView(focus); return; }
  chatThreadView(focus);
}
function chatComposer(onSend, placeholder) {
  const ta = h('textarea', { class: 'adv-input', rows: 1, maxlength: '2000', placeholder, 'aria-label': 'Treść wiadomości' });
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  const btn = h('button', { type: 'submit', class: 'btn btn-gold btn-sm', text: 'Wyślij' });
  const form = h('form', { class: 'chat-form', onsubmit: async (e) => {
    e.preventDefault(); const v = ta.value.trim(); if (!v || CHAT.sending) return;
    CHAT.sending = true; btn.disabled = true;
    const ok = await onSend(v);
    CHAT.sending = false; btn.disabled = false;
    if (ok) { ta.value = ''; fit(); } ta.focus();
  } }, ta, btn);
  return { form, ta };
}
function chatThreadView(focus) {
  const admin = isAdmin, c = CHAT.sel;
  CHAT.list = h('div', { class: 'chat-list' });
  const comp = chatComposer(chatSend, admin ? `Odpowiedz${c?.full_name ? ' – ' + c.full_name.split(' ')[0] : ''}…` : 'Napisz wiadomość…');
  const parts = [];
  if (admin && c) {
    parts.push(h('div', { class: 'chat-head' },
      h('button', { type: 'button', class: 'chat-back', 'aria-label': 'Wróć do listy klientów', text: '←', onclick: () => { CHAT.sel = null; CHAT.loadedFor = null; chatRender(true); } }),
      h('span', { class: 'chat-av', text: (c.full_name || c.email || '?').trim()[0].toUpperCase() }),
      h('div', { class: 'chat-who' }, h('b', { text: c.full_name || c.email }), h('small', { text: [c.email, c.phone].filter(Boolean).join(' · ') }))));
    const acts = h('div', { class: 'chat-actions' });
    if (discordUrl(c.discord_id)) acts.append(...discordButtons(c.discord_id, c.discord_username, c.discord_name, true));
    acts.append(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Zlecenia klienta', onclick: () => withAdmin(() => { adm.q = String(c.email || '').toLowerCase(); navigate('/konto'); showTab('admin'); if (matchMedia('(max-width: 640px)').matches) advClose(); }) }));
    if (c.email) acts.append(h('a', { class: 'btn btn-ghost', href: `mailto:${c.email}`, text: 'E-mail' }));
    parts.push(acts);
  }
  if (!admin) { parts.push(chatTeamBar()); teamLoad(); }
  parts.push(CHAT.list, comp.form);
  if (!admin) parts.push(h('p', { class: 'chat-note', text: 'Odpowiadamy zwykle tego samego dnia. Wiadomości widzisz tylko Ty i nasz zespół.' }));
  CHAT.view.replaceChildren(...parts);
  CHAT.ta = comp.ta;
  if (!admin && CHAT.prefill) { comp.ta.value = CHAT.prefill; CHAT.prefill = ''; comp.ta.dispatchEvent(new Event('input')); focus = true; }
  const who = admin ? c.customer_id : session.user.id;
  if (CHAT.loadedFor === who) chatPaint(); else chatLoad(who);
  if (focus && !matchMedia('(pointer: coarse)').matches) setTimeout(() => comp.ta.focus(), 30);
}
function chatPaint() {
  const box = CHAT.list; if (!box) return;
  box.replaceChildren();
  if (!CHAT.msgs.length) {
    box.append(chatEmpty(isAdmin ? h('span', { text: 'Brak wiadomości. Napisz pierwszą – klient zobaczy ją w okienku czatu i w Strefie Klienta.' })
      : [h('b', { text: 'Cześć! 👋' }), h('span', { text: `Opisz sprawę – sprzęt, objawy, termin. Odpowie ${TEAM.list.map((t) => t.display_name).join(' albo ')}.` })]));
    return;
  }
  let day = '';
  for (const m of CHAT.msgs) {
    const d = chatDay(m.created_at); if (d !== day) { day = d; box.append(h('div', { class: 'chat-day', text: d })); }
    box.append(chatBubble(m));
  }
  box.scrollTop = box.scrollHeight;
}
function chatBubble(m) {
  const mine = isAdmin ? !m.from_customer : m.from_customer;
  const t = !m.from_customer ? teamBySender(m.sender_id) : null;
  let from = null;
  if (!mine) from = isAdmin ? h('span', { class: 'chat-from', text: CHAT.sel?.full_name || 'Klient' })
    : h('span', { class: 'chat-from team' }, t ? teamAvatar(t, 'team-av xs') : null, h('span', { text: t ? t.display_name : 'Strike Tech Lab' }), t ? h('em', { text: t.role_label || 'Administrator' }) : null);
  else if (isAdmin && m.sender_id && m.sender_id !== session?.user?.id) from = h('span', { class: 'chat-from', text: t ? `${t.display_name} (zespół)` : 'Zespół' });   // odpowiedź drugiego administratora
  const bubble = h('div', { class: `adv-msg ${mine ? 'me' : 'bot'}`, 'data-id': m.id }, from,
    h('span', { class: 'chat-txt', text: m.body }), h('time', { class: 'chat-time', datetime: m.created_at, text: chatTime(m.created_at) }));
  return bubble;
}
async function chatLoad(customerId) {
  CHAT.list?.replaceChildren(h('p', { class: 'muted small', style: 'margin:auto', text: 'Ładuję wiadomości…' }));
  const { data, error } = await sb.from('support_messages')
    .select('id,body,from_customer,sender_id,created_at,conversation_id,support_conversations!inner(customer_id)')
    .eq('support_conversations.customer_id', customerId).order('created_at', { ascending: false }).limit(200);
  if ((isAdmin ? CHAT.sel?.customer_id : session?.user?.id) !== customerId) return;   // w międzyczasie wybrano kogoś innego
  if (error) { CHAT.list?.replaceChildren(chatEmpty(h('span', { text: chatErr(error) }))); return; }
  CHAT.msgs = (data || []).reverse(); CHAT.loadedFor = customerId; CHAT.convId = CHAT.msgs.at(-1)?.conversation_id || null;
  chatPaint(); chatMarkRead();
}
function chatAdd(m) {
  if (CHAT.msgs.some((x) => x.id === m.id)) return;
  CHAT.msgs.push(m); CHAT.convId ||= m.conversation_id;
  if (!CHAT.list?.isConnected) return;
  if (CHAT.msgs.length === 1) { chatPaint(); return; }
  const prev = CHAT.msgs.at(-2); if (chatDay(prev.created_at) !== chatDay(m.created_at)) CHAT.list.append(h('div', { class: 'chat-day', text: chatDay(m.created_at) }));
  CHAT.list.append(chatBubble(m)); CHAT.list.scrollTop = CHAT.list.scrollHeight;
}
async function chatSend(text) {
  const args = { p_body: text }; if (isAdmin) { if (!CHAT.sel) return false; args.p_customer = CHAT.sel.customer_id; }
  const { data, error } = await sb.rpc('chat_send', args);
  if (error) { toast('err', chatErr(error)); return false; }
  const m = Array.isArray(data) ? data[0] : data;
  if (m?.id) { CHAT.loadedFor = isAdmin ? CHAT.sel.customer_id : session.user.id; chatAdd(m); }
  if (isAdmin) chatInboxLoad(true);
  return true;
}
async function chatMarkRead() {
  if (!session || !chatIsOpen()) return;
  if (isAdmin) {
    if (!CHAT.sel) return;
    await sb.rpc('chat_mark_read', { p_customer: CHAT.sel.customer_id }).then(() => {}, () => {});
    const row = CHAT.inbox.find((r) => r.customer_id === CHAT.sel.customer_id); if (row) row.unread = 0;
    chatInboxLoad(true);
  } else {
    if (!CHAT.unread) return;
    await sb.rpc('chat_mark_read').then(() => {}, () => {});
    CHAT.unread = 0; chatBadge();
  }
}

/* --- skrzynka administratora --- */
function chatInboxView(focus) {
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj klienta: imię, e-mail, telefon, Discord', 'aria-label': 'Szukaj klienta', value: CHAT.q,
    oninput: debounce((e) => { CHAT.q = e.target.value.trim(); chatInboxLoad(); }, 300) });
  CHAT.inboxBox = h('div', { class: 'chat-inbox' }, h('p', { class: 'muted small', style: 'padding:14px', text: 'Ładuję rozmowy…' }));
  teamLoad();
  CHAT.view.replaceChildren(chatTeamBar(), h('div', { class: 'chat-search' }, q), CHAT.inboxBox);   // zespół widoczny też dla admina – tak samo jak u klienta
  if (focus && !matchMedia('(pointer: coarse)').matches) setTimeout(() => q.focus(), 30);
  chatInboxPaint(); chatInboxLoad();
}
let inboxSeq = 0;
async function chatInboxLoad(silent = false) {
  if (!isAdmin || !sb) return;
  const seq = ++inboxSeq, q = CHAT.q;
  const { data, error } = await sb.rpc('chat_inbox', { p_search: q || null, p_limit: 80 });
  if (seq !== inboxSeq) return;
  if (error) { CHAT.err = /Brak dostępu/.test(error.message) ? 'mfa' : chatErr(error); if (!silent || CHAT.inboxBox) chatInboxPaint(); return; }
  const wasErr = CHAT.err === 'mfa'; CHAT.err = '';
  CHAT.inbox = data || [];
  if (!q) { CHAT.unread = CHAT.inbox.reduce((s, r) => s + (r.unread || 0), 0); chatBadge(); }
  if (wasErr) chatSubscribe();            // po potwierdzeniu 2FA – nasłuch z nowymi uprawnieniami
  chatInboxPaint();
}
function chatInboxPaint() {
  const box = CHAT.inboxBox; if (!box?.isConnected) return;
  if (CHAT.err === 'mfa') {
    box.replaceChildren(chatEmpty(h('b', { text: 'Potwierdź logowanie kodem 2FA' }),
      h('span', { text: 'Wiadomości klientów widać dopiero po wpisaniu kodu z aplikacji uwierzytelniającej – tak samo jak zamówienia.' }),
      h('button', { type: 'button', class: 'btn btn-gold btn-sm', text: 'Przejdź do panelu', onclick: () => { navigate('/konto'); showTab('admin'); } })));
    return;
  }
  if (CHAT.err) { box.replaceChildren(chatEmpty(h('span', { text: CHAT.err }))); return; }
  const rows = CHAT.inbox;
  if (!rows.length) { box.replaceChildren(chatEmpty(h('span', { text: CHAT.q ? 'Nie znaleziono klienta.' : 'Brak rozmów. Wyszukaj klienta powyżej, żeby napisać pierwszy.' }))); return; }
  const withMsg = rows.filter((r) => r.last_message_at), without = rows.filter((r) => !r.last_message_at);
  const row = (r) => h('button', { type: 'button', class: `chat-row${r.unread ? ' unread' : ''}`, onclick: () => chatOpenClient(r.customer_id, r) },
    h('span', { class: 'chat-av', text: (r.full_name || r.email || '?').trim()[0].toUpperCase() }),
    h('span', { class: 'meta' },
      h('span', { class: 'top' }, h('b', { text: r.full_name || r.email }), r.discord_id ? h('span', { class: 'dc', title: `Discord: ${r.discord_username || ''}`, html: ICO.discord }) : null,
        r.last_message_at ? h('time', { text: chatShort(r.last_message_at) }) : null, r.unread ? h('span', { class: 'cnt', text: String(r.unread) }) : null),
      h('p', { text: r.last_message_at ? `${r.last_from_customer ? '' : 'Ty: '}${r.last_preview || ''}` : (r.email + (r.phone ? ` · ${r.phone}` : '')) })));
  box.replaceChildren(...withMsg.map(row), without.length ? h('div', { class: 'chat-sec', text: 'Klienci bez rozmowy' }) : '', ...without.map(row));
}
async function chatOpenClient(id, row = null) {
  if (!isAdmin || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  let c = row || CHAT.inbox.find((r) => r.customer_id === id);
  if (!c) {
    const { data } = await sb.from('profiles').select('id,email,full_name,phone').eq('id', id).maybeSingle();
    if (!data) { toast('err', 'Nie znaleziono klienta (albo potwierdź logowanie kodem 2FA).'); return; }
    c = { customer_id: data.id, email: data.email, full_name: data.full_name, phone: data.phone };
  }
  CHAT.sel = { ...c }; CHAT.loadedFor = null; CHAT.msgs = []; CHAT.convId = null;
  chatOpen('msgs');
  getSocial(id, true).then((list) => {          // świeże dane Discorda
    const d = list.find((x) => x.provider === 'discord');
    if (CHAT.sel?.customer_id !== id) return;
    const changed = (d?.provider_user_id || null) !== (CHAT.sel.discord_id || null);
    Object.assign(CHAT.sel, { discord_id: d?.provider_user_id || null, discord_username: d?.username || null, discord_name: d?.display_name || null });
    if (changed && CHAT.tab === 'msgs') { const keep = CHAT.loadedFor; chatThreadView(false); CHAT.loadedFor = keep; }
  });
}

/* --- na żywo --- */
function chatSubscribe() {
  chatUnsubscribe(); if (!sb || !session) return;
  sb.auth.getSession().then(({ data }) => {
    if (!session || CHAT.channel) return;
    if (data.session?.access_token) sb.realtime.setAuth?.(data.session.access_token);
    CHAT.channel = sb.channel(`stl-chat-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (p) => chatIncoming(p.new))
      .subscribe();
  });
}
function chatUnsubscribe() { if (CHAT.channel && sb) sb.removeChannel(CHAT.channel); CHAT.channel = null; }
function chatIncoming(m) {
  if (!m?.id) return;
  if (isAdmin) {
    const viewing = CHAT.sel && (CHAT.convId ? CHAT.convId === m.conversation_id : false);
    if (viewing) { chatAdd(m); if (chatIsOpen()) chatMarkRead(); }
    if (m.from_customer && !(viewing && chatIsOpen())) toast('info', '💬 Nowa wiadomość od klienta.');
    chatInboxLoadSoon();
    return;
  }
  if (CHAT.loadedFor === session?.user?.id) chatAdd(m);
  if (!m.from_customer) {
    if (chatIsOpen()) { CHAT.unread = 1; chatMarkRead(); }
    else { CHAT.unread += 1; chatBadge(); const t = teamBySender(m.sender_id); toast('info', `💬 ${t ? `${t.display_name} (${t.role_label || 'Administrator'}) odpisał` : 'Nowa odpowiedź od Strike Tech Lab'} – otwórz czat w prawym dolnym rogu.`); }
  }
}
const chatInboxLoadSoon = debounce(() => chatInboxLoad(true), 500);
async function chatRefreshUnread() {
  if (!sb || !session) { CHAT.unread = 0; chatBadge(); return; }
  if (isAdmin) { if (!CHAT.q) chatInboxLoad(true); return; }
  const { data, error } = await sb.rpc('chat_my_unread');
  if (!error) { CHAT.unread = Number(data) || 0; chatBadge(); if (chatIsOpen()) chatMarkRead(); }
}
function chatOnSession() {
  CHAT.msgs = []; CHAT.loadedFor = null; CHAT.convId = null; CHAT.sel = null; CHAT.inbox = []; CHAT.err = ''; CHAT.unread = 0;
  chatUnsubscribe(); chatBadge();
  if (session) { chatSubscribe(); chatRefreshUnread(); }
  teamLoad();
  if (CHAT.mounted) { chatSetTab(CHAT.tab, false); }
}
setInterval(() => { if (session && document.visibilityState === 'visible') chatRefreshUnread(); }, 90000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && chatIsOpen()) chatMarkRead(); });

/* --- Discord i kontakt z klientem w panelu administratora --- */
const SOCIAL_CACHE = new Map();
function getSocial(id, fresh = false) {
  if (!fresh && SOCIAL_CACHE.has(id)) return SOCIAL_CACHE.get(id);
  const p = sb.rpc('sync_social_accounts', { p_user: id }).then(({ data, error }) => (error ? [] : data || []), () => []);
  SOCIAL_CACHE.set(id, p); return p;
}
function discordButtons(id, username, name, compact = false) {
  const url = discordUrl(id); if (!url) return [];
  const label = username ? `@${username}` : (name || 'profil');
  return [
    h('a', { class: `btn btn-discord${compact ? '' : ' btn-sm'}`, href: url, target: '_blank', rel: 'noopener noreferrer', title: 'Otwiera profil w Discordzie – tam dodasz do znajomych albo napiszesz' },
      h('span', { html: ICO.discord, style: 'display:inline-flex' }), h('span', { text: `Discord: ${label}` })),
    username ? h('button', { type: 'button', class: `btn btn-ghost${compact ? '' : ' btn-sm'}`, text: 'Kopiuj nazwę', onclick: () => navigator.clipboard?.writeText(username).then(() => toast('ok', `Skopiowano „${username}” – w Discordzie: Znajomi → Dodaj znajomego.`), () => toast('err', 'Nie udało się skopiować.')) }) : null,
  ].filter(Boolean);
}
function clientContact(userId) {
  if (!userId || !sb) return null;
  const disc = h('span', { class: 'muted small', text: 'Sprawdzam Discord…' });
  const box = h('div', { class: 'client-contact' },
    h('button', { type: 'button', class: 'btn btn-gold btn-sm', onclick: () => chatOpenClient(userId) }, h('span', { html: ICO.chat, style: 'display:inline-flex;width:18px;height:18px' }), h('span', { text: 'Napisz na czacie' })), disc);
  getSocial(userId).then((list) => {
    const d = list.find((x) => x.provider === 'discord');
    const btns = d ? discordButtons(d.provider_user_id, d.username, d.display_name) : [];
    disc.replaceWith(...(btns.length ? btns : [h('span', { class: 'muted small', text: 'Klient nie połączył Discorda.' })]));
  });
  return box;
}

/* ------------------------------------------------------------------ raport STRIKE PROOF w panelu admina (szablon usługi → PDF) */
let REPmod = null, REPload = null;
const repModule = () => (REPload ||= import(BASE + 'stl-report.js').then((m) => (REPmod = m)).catch((e) => { REPload = null; throw e; }));
function downloadBlob(blob, name) { const u = URL.createObjectURL(blob); const a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
/* ------------------------------------------------------------------ kontakt */
function renderContactTopics() {
  const sel = $('#cTopic'), cur = sel.value;
  sel.replaceChildren(h('option', { text: 'Pytanie ogólne' }), ...[...cat.services.values()].map((s) => h('option', { text: s.name })), h('option', { text: 'Komputer na zamówienie' }), h('option', { text: 'Inne' }));
  if (cur) sel.value = cur;
}
async function submitContact(e) {
  e.preventDefault();
  const out = $('#cMsgOut'), btn = e.target.querySelector('button[type=submit]');
  $$('[data-cerr]').forEach((x) => { x.textContent = ''; });
  $$('#contactForm [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  const v = { name: $('#cName').value.trim(), email: $('#cMail').value.trim(), phone: $('#cPhone').value.trim(), topic: $('#cTopic').value, message: $('#cMsg').value.trim() };
  const f = {};
  if (v.name.length < 2) f.name = 'Podaj imię lub nazwę firmy.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) f.email = 'Podaj poprawny adres e-mail.';
  if (v.message.length < 10) f.message = 'Opisz krótko, w czym możemy pomóc (min. 10 znaków).';
  if (!$('#cConsent').checked) f.consent = 'Potwierdź, że znasz Politykę Prywatności.';
  const CIN = { name: '#cName', email: '#cMail', message: '#cMsg', consent: '#cConsent' };
  for (const [k, m] of Object.entries(f)) { $(`[data-cerr=${k}]`).textContent = m; $(CIN[k])?.setAttribute('aria-invalid', 'true'); }
  if (Object.keys(f).length) { $(CIN[Object.keys(f)[0]])?.focus(); return; }
  if (!sb) {   // bez serwera: otwórz program pocztowy z gotową wiadomością
    location.href = `mailto:${CFG.CONTACT_EMAIL}?subject=${encodeURIComponent(v.topic + ' – ' + v.name)}&body=${encodeURIComponent(`${v.message}\n\n${v.name}\n${v.email}${v.phone ? '\n' + v.phone : ''}`)}`;
    return;
  }
  setBusy(btn, true, 'Wysyłam…'); out.className = 'form-msg';
  try {
    await callFn('inquiry', { kind: /Komputer|Wycena/.test(v.topic) ? 'quote' : 'contact', ...v, phone: v.phone || undefined, item_id: /Komputer/.test(v.topic) ? 'pc-custom' : undefined, consent: true, hp: $('#cHp').value });
    e.target.reset(); renderContactTopics(); out.className = 'form-msg ok'; out.textContent = 'Dziękujemy! Wiadomość wysłana – potwierdzenie przyszło na Twój e-mail.';
  } catch (err) {
    out.className = 'form-msg err'; out.textContent = `${err.message} Możesz też napisać bezpośrednio: ${CFG.CONTACT_EMAIL}`;
    for (const [k, m] of Object.entries(err.fields || {})) { const el = $(`[data-cerr=${k}]`); if (el) el.textContent = m; }
  }
  setBusy(btn, false, 'Wyślij wiadomość');
}

/* ------------------------------------------------------------------ najbliższy wolny termin (konsola) */
let nextFreeAt = 0;
async function findNextFree() {
  if (!sb || !cat.live || Date.now() - nextFreeAt < 240000) return; nextFreeAt = Date.now();
  const id = cat.services.has('strike-precision-tune') ? 'strike-precision-tune' : [...cat.services.keys()][0];
  for (let i = 0; i < 14; i++) {
    const day = addDays(todayKey(), i); if (wday(day) === 0 || wday(day) === 6) continue;
    const { data, error } = await sb.rpc('get_available_slots', { p_service_id: id, p_day: day });
    if (error) return;
    if (data?.length) { $('#cNext') && ($('#cNext').textContent = `${fmt(data[0].starts_at, { weekday: 'short', day: 'numeric', month: 'short' })} ${hm(data[0].starts_at)}`); return; }
  }
  $('#cNext') && ($('#cNext').textContent = 'brak w 14 dni');
}
setInterval(() => { if (document.visibilityState === 'visible') findNextFree(); }, 300000);

/* ------------------------------------------------------------------ teksty prawne
   Dane sprzedawcy pochodzą z window.STL_CONFIG.COMPANY (góra pliku). Dopóki NAME lub ADDRESS są puste,
   w dokumentach widać żółte pola [UZUPEŁNIJ]. Teksty przygotowano starannie, ale nie zastępują porady prawnika. */
const LEGAL_VERSION = '1 listopada 2026';
const escH = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (v, what) => v ? escH(v) : `<mark>[UZUPEŁNIJ: ${what}]</mark>`;
const COMPANY_OK = !!(CO.NAME && CO.ADDRESS);
if (!COMPANY_OK) console.warn('[Strike Tech Lab] Uzupełnij STL_CONFIG.COMPANY (nazwa i adres sprzedawcy) przed publikacją strony.');
const MAIL = escH(CFG.CONTACT_EMAIL);
const SELLER = `${fill(CO.NAME, 'imię i nazwisko / nazwa firmy')}, ${fill(CO.ADDRESS, 'adres')}${CO.NIP ? `, NIP ${escH(CO.NIP)}` : ''}${CO.REGON ? `, REGON ${escH(CO.REGON)}` : ''}${CO.REGISTRY ? ` (${escH(CO.REGISTRY)})` : ''}, e-mail: ${MAIL}${CO.PHONE ? `, tel. ${escH(CO.PHONE)}` : ''}`;
const RETURN_ADDR = CO.RETURN_ADDRESS ? escH(CO.RETURN_ADDRESS) : fill(CO.ADDRESS, 'adres do zwrotów');
const DRAFT_NOTE = COMPANY_OK ? '' : '<p class="note">Wersja robocza: uzupełnij dane sprzedawcy w konfiguracji strony i zleć weryfikację tekstu prawnikowi.</p>';
function renderCompany() {
  const box = $('#companyInfo'); if (!box) return;
  box.innerHTML = `Sprzedawca: ${SELLER}`;
}
const SETS_TERMS = '<h4>§6 Komputery na zamówienie</h4><p>Zestawy pokazane na stronie są przykładowe, a ich ceny orientacyjne – zależą od aktualnych cen i dostępności części. Zapytanie o wycenę jest bezpłatne i do niczego nie zobowiązuje. Wiążącą ofertę z pełną listą części i ceną przesyłamy mailowo; umowa zostaje zawarta po jej akceptacji i wpłacie całej ceny z góry. Zmiana podzespołu po zawarciu umowy jest możliwa wyłącznie za Twoją zgodą; jeśli jej nie wyrazisz, możesz zrezygnować z zamówienia i otrzymasz zwrot całej wpłaty. Komputer odbierasz osobiście albo wysyłamy go kurierem – koszt wysyłki podajemy w ofercie.</p>';
const LEGAL = {
  privacy: { t: 'Polityka Prywatności', h: DRAFT_NOTE +
    `<p class="note">Wersja z ${LEGAL_VERSION}.</p>` +
    `<h4>1. Kto jest administratorem danych</h4><p>Administratorem Twoich danych osobowych jest ${SELLER} – prowadzący serwis Strike Tech Lab. We wszystkich sprawach dotyczących danych napisz na ${MAIL}. Nie wyznaczyliśmy inspektora ochrony danych.</p>` +
    '<h4>2. Jakie dane, w jakim celu i na jakiej podstawie</h4><ul>' +
    '<li><b>Konto w Strefie Klienta</b> – e-mail, hasło (przechowywane wyłącznie jako skrót kryptograficzny), imię i nazwisko, telefon (jeśli go podasz). Podstawa: umowa o prowadzenie konta (art. 6 ust. 1 lit. b RODO).</li>' +
    '<li><b>Logowanie przez Google lub Discord</b> (jeśli je wybierzesz) – od dostawcy otrzymujemy adres e-mail, imię lub nazwę i zdjęcie profilowe, a z Discorda także nazwę użytkownika i identyfikator konta. Dzięki nim możemy się z Tobą skontaktować również przez Discord. Hasła do tych serwisów nie poznajemy. Konto odłączysz w Strefie Klienta. Podstawa: umowa o prowadzenie konta (art. 6 ust. 1 lit. b RODO).</li>' +
    '<li><b>Czat w Strefie Klienta</b> – treść wiadomości i ich daty. Rozmowę widzisz tylko Ty i osoby z naszego zespołu. Podstawa: umowa i działania przed jej zawarciem (art. 6 ust. 1 lit. b RODO) oraz nasz prawnie uzasadniony interes – obsługa zapytań (art. 6 ust. 1 lit. f RODO).</li>' +
    '<li><b>Opinie</b> (jeśli je wystawisz) – ocena, treść, imię i pierwsza litera nazwiska oraz nazwa usługi; publikujemy je na stronie po sprawdzeniu, że pochodzą od klienta z zakończonym zleceniem. Podstawa: Twoja zgoda wyrażona przez wysłanie opinii (art. 6 ust. 1 lit. a RODO) – opinię możesz w każdej chwili usunąć, pisząc do nas albo usuwając konto.</li>' +
    '<li><b>Rezerwacja i realizacja zamówienia</b> – imię i nazwisko, e-mail, telefon (opcjonalnie), dla firm: nazwa i NIP, sposób przekazania sprzętu i miasto (opcjonalnie), uwagi do zlecenia, wybrany termin, konfiguracja, specyfikacja i wyniki pomiarów Twojego komputera oraz raporty. Podstawa: zawarcie i wykonanie umowy (art. 6 ust. 1 lit. b RODO).</li>' +
    '<li><b>Płatności</b> – kwota, status i identyfikator płatności. Danych karty ani kodu BLIK nie otrzymujemy – przetwarza je Stripe. Podstawa: art. 6 ust. 1 lit. b i c RODO.</li>' +
    '<li><b>Rachunkowość i podatki</b> – dane z dokumentów sprzedaży. Podstawa: obowiązek prawny (art. 6 ust. 1 lit. c RODO).</li>' +
    '<li><b>Formularz kontaktowy i zapytania o wycenę</b> – imię lub nazwa firmy, e-mail, telefon (opcjonalnie), treść wiadomości. Podstawa: nasz prawnie uzasadniony interes, czyli odpowiedź na Twoją wiadomość (art. 6 ust. 1 lit. f RODO), a gdy pytasz o zawarcie umowy – działania przed jej zawarciem (art. 6 ust. 1 lit. b RODO).</li>' +
    '<li><b>Ochrona przed nadużyciami i dowód złożenia oświadczeń</b> – skrót (hash) adresu IP przy formularzu kontaktowym, służący do limitu wiadomości i usuwany po 24 godzinach; przy zamówieniu: data złożonych oświadczeń i informacja o przeglądarce. Podstawa: prawnie uzasadniony interes – ochrona przed spamem i możliwość wykazania złożonych oświadczeń (art. 6 ust. 1 lit. f RODO).</li>' +
    '<li><b>Program poleceń</b> – Twój kod, informacja, kto skorzystał z kodu, oraz porównanie konta, e-maila i telefonu, żeby nie dało się polecić samego siebie. Podstawa: regulamin programu (art. 6 ust. 1 lit. b RODO) i prawnie uzasadniony interes – zapobieganie nadużyciom (art. 6 ust. 1 lit. f RODO).</li>' +
    '<li><b>Informacje o promocjach e-mailem</b> – tylko jeśli zaznaczysz zgodę (art. 6 ust. 1 lit. a RODO i przepisy Prawa komunikacji elektronicznej). Zgodę wycofasz w każdej chwili w Strefie Klienta lub mailowo; wycofanie nie wpływa na zgodność z prawem wcześniejszej wysyłki.</li>' +
    '<li><b>Dochodzenie roszczeń i obrona przed nimi</b> – dane z zamówień i korespondencji. Podstawa: art. 6 ust. 1 lit. f RODO.</li>' +
    '</ul>' +
    '<h4>3. Sesja zdalna</h4><p>Podczas sesji przez RustDesk możemy zobaczyć na ekranie Twoje pliki. Nie kopiujemy ich – zapisujemy tylko specyfikację sprzętu i wyniki pomiarów potrzebne do raportu. Przed sesją zamknij dokumenty i programy z danymi prywatnymi. Klientom firmowym, u których możemy mieć dostęp do danych osobowych ich klientów lub pracowników, zawieramy na życzenie umowę powierzenia przetwarzania danych.</p>' +
    `<h4>4. Komu przekazujemy dane</h4><ul><li>Google Ireland Ltd. oraz Discord Inc. (USA) – tylko jeśli logujesz się kontem w ich serwisie; przy logowaniu działają jako odrębni administratorzy i stosują własne polityki prywatności.</li><li>Supabase Inc. (USA) – baza danych, logowanie i przechowywanie raportów, na podstawie umowy powierzenia.</li><li>Stripe Payments Europe Ltd. (Irlandia) – obsługa płatności; w części dotyczącej płatności Stripe działa jako odrębny administrator i stosuje własną politykę prywatności.</li><li>Dostawca wysyłki e-maili z systemu: ${fill(CO.MAIL_PROVIDER, 'nazwa dostawcy wysyłki e-mail')}.</li><li>Dostawca hostingu strony i poczty: ${fill(CO.HOSTING, 'nazwa firmy hostingowej')}.</li><li>Google (arkusz Google Sheets: rozliczenia – kwoty i numery zleceń, przy zakupach firmowych nazwa firmy i NIP – oraz kopia wiadomości z formularza kontaktowego) – tylko jeśli ta funkcja jest włączona.</li>${CFG.TURNSTILE_SITE_KEY ? '<li>Cloudflare, Inc. (zabezpieczenie Turnstile przy logowaniu i rejestracji – ochrona przed botami; przetwarza m.in. adres IP i dane przeglądarki).</li>' : ''}<li>Biuro rachunkowe, firmy kurierskie i operatorzy pocztowi – gdy jest to potrzebne do rozliczeń lub wysyłki.</li><li>Organy publiczne – wyłącznie gdy wymagają tego przepisy.</li></ul><p>Sesje zdalne łączymy programem RustDesk przez publiczne serwery pośredniczące projektu RustDesk (Purslane Ltd., Singapur). Transmisja jest szyfrowana end-to-end, więc serwer pośredniczący nie widzi obrazu ani danych sesji – przekazuje tylko zaszyfrowany ruch i adresy połączenia.</p>` +
    '<h4>5. Przekazywanie danych poza Europejski Obszar Gospodarczy</h4><p>Część dostawców (np. Supabase, Google) ma siedzibę w USA lub może przetwarzać dane poza EOG. Odbywa się to na podstawie decyzji Komisji Europejskiej o adekwatności (EU-US Data Privacy Framework – jeśli dostawca jest certyfikowany) albo standardowych klauzul umownych. Kopię zabezpieczeń możesz otrzymać, pisząc do nas.</p>' +
    '<h4>6. Jak długo przechowujemy dane</h4><ul><li>Konto, połączone konta Google/Discord, wiadomości z czatu, opinie oraz pliki z raportami i zdjęciami sprzętu – do usunięcia konta (zrobisz to samodzielnie w Strefie Klienta).</li><li>Konto, którego adres e-mail nie został potwierdzony – 7 dni od rejestracji (jeśli nie złożono zamówienia).</li><li>Rezerwacje, które nie zostały opłacone (wygasłe lub anulowane) – 90 dni.</li><li>Zamówienia i dokumenty sprzedaży – do upływu terminów przedawnienia zobowiązań podatkowych (5 lat od końca roku, w którym upłynął termin płatności podatku) i roszczeń z umowy (art. 118 Kodeksu cywilnego), w zależności od tego, który termin jest dłuższy. Po usunięciu konta zamówienia zostają bez powiązania z kontem, a po upływie tych terminów dane osobowe w zamówieniu są automatycznie anonimizowane (zostają tylko kwoty i nazwa usługi).</li><li>Wiadomości z formularza – 12 miesięcy od otrzymania, chyba że stały się częścią zamówienia.</li><li>Skrót adresu IP – 24 godziny.</li><li>Zgoda marketingowa – do jej wycofania.</li><li>Kopie zapasowe bazy prowadzone przez dostawcę – usunięte dane znikają z nich, gdy kopie są nadpisywane (zwykle do 7 dni).</li></ul>' +
    '<h4>7. Twoje prawa</h4><p>Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania i przeniesienia (w Strefie Klienta pobierzesz je jako plik JSON), a także prawo wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie i prawo wycofania zgody. Napisz na ' + MAIL + '. Masz też prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl).</p>' +
    '<h4>8. Czy musisz podać dane</h4><p>Podanie danych jest dobrowolne, ale bez danych oznaczonych jako wymagane nie zawrzemy umowy ani nie odpowiemy na wiadomość. Pola opcjonalne są tak oznaczone.</p>' +
    '<h4>9. Zautomatyzowane decyzje</h4><p>Nie podejmujemy decyzji wywołujących wobec Ciebie skutki prawne wyłącznie automatycznie i nie profilujemy Cię w celach marketingowych. System automatycznie sprawdza jedynie poprawność kodów rabatowych.</p>' +
    '<h4>10. Pliki cookies</h4><p>Zasady opisuje <button type="button" class="link" data-legal="cookies">Polityka cookies</button>.</p>' },
  cookies: { t: 'Polityka cookies', h: DRAFT_NOTE +
    `<p class="note">Wersja z ${LEGAL_VERSION}.</p>` +
    '<h4>Czy potrzebna jest Twoja zgoda?</h4><p>Nie. Strona nie używa cookies ani innych narzędzi analitycznych, reklamowych czy śledzących (np. Google Analytics, Meta Pixel, wtyczek mediów społecznościowych). Zapisuje w przeglądarce tylko informacje niezbędne do działania usług, o które prosisz – a na to przepisy (art. 399 Prawa komunikacji elektronicznej) nie wymagają zgody. Dlatego nie wyświetlamy banera zgody.</p>' +
    '<h4>Co zapisujemy w Twojej przeglądarce</h4><ul>' +
    '<li><code>sb-…-auth-token</code> (pamięć lokalna) – utrzymuje zalogowanie w Strefie Klienta; usuwany po wylogowaniu.</li>' +
    '<li><code>stl_remember</code> (pamięć lokalna) – zapisuje się tylko, gdy przy logowaniu odznaczysz „Nie wylogowuj mnie”; wtedy dane logowania trzymamy w pamięci sesji i znikają po zamknięciu karty.</li><li><code>stl-guide-…</code> (pamięć lokalna) – tylko dla administratora: zaznaczone kroki w instrukcjach serwisowych.</li><li><code>stl_booking_draft</code> (pamięć sesji) – wersja robocza formularza rezerwacji, żeby wpisane dane nie zniknęły po odświeżeniu; znika po zamknięciu karty i po opłaceniu zamówienia.</li>' +
    '<li><code>stl_last_order</code> (pamięć sesji) – numer ostatniego zamówienia na czas powrotu ze strony płatności; znika po zamknięciu karty.</li><li><code>stl_auth_return_v1</code> (pamięć sesji) – dokąd wrócić po zalogowaniu (np. do rezerwacji albo czatu); usuwany zaraz po powrocie.</li><li><code>stl_intro</code> (pamięć sesji) – czy animacja startowa była już pokazana, żeby przy kolejnych odsłonach trwała krócej; znika po zamknięciu karty.</li></ul><p>Zdjęcia i filmy na stronie są serwowane z naszego serwera.</p>' +
    '<p>Strona nie zapisuje plików cookies w przeglądarce.</p>' +
    '<h4>Połączenia z innymi serwerami</h4><ul><li>Supabase – serwer bazy danych i logowania (nasz dostawca, przetwarza dane na nasze zlecenie).</li><li>Stripe (checkout.stripe.com) – strona płatności, na którą przechodzisz po złożeniu zamówienia. Stripe stosuje na swojej stronie własne cookies.</li><li>cdn.jsdelivr.net – tylko gdy nie działa lokalna kopia biblioteki połączenia z serwerem; wtedy serwer CDN widzi Twój adres IP.</li>' + (CFG.TURNSTILE_SITE_KEY ? '<li>challenges.cloudflare.com – zabezpieczenie „nie jestem robotem” (Cloudflare Turnstile) w formularzu logowania i rejestracji. Służy wyłącznie ochronie przed botami, więc zgodnie z art. 399 Prawa komunikacji elektronicznej nie wymaga zgody.</li>' : '') + '</ul><p>Czcionka i pozostałe pliki strony są serwowane z naszego serwera.</p>' +
    '<h4>Jak usunąć zapisane dane</h4><p>Wyloguj się albo wyczyść dane witryny w ustawieniach przeglądarki.</p>' },
  terms: { t: 'Regulamin', h: DRAFT_NOTE +
    `<p class="note">Wersja z ${LEGAL_VERSION}.</p>` +
    `<h4>§1 Sprzedawca i definicje</h4><p>Serwis internetowy Strike Tech Lab prowadzi ${SELLER} („Sprzedawca”). <b>Klient</b> – osoba lub firma korzystająca z serwisu. <b>Konsument</b> – osoba fizyczna zawierająca umowę niezwiązaną bezpośrednio z jej działalnością gospodarczą lub zawodową. <b>Przedsiębiorca na prawach konsumenta</b> – osoba fizyczna prowadząca jednoosobową działalność, dla której umowa nie ma charakteru zawodowego (art. 38a ustawy o prawach konsumenta); ma ona prawa konsumenta opisane w §7 i §8.</p>` +
    '<h4>§2 Usługi elektroniczne i wymagania techniczne</h4><p>Bezpłatnie udostępniamy: konto w Strefie Klienta, formularz rezerwacji, formularz kontaktowy i program poleceń. Potrzebujesz urządzenia z internetem, aktualnej przeglądarki z włączonym JavaScriptem i aktywnego adresu e-mail. Zakazane jest przesyłanie treści bezprawnych. Umowę o konto zawieramy na czas nieokreślony – możesz ją rozwiązać w każdej chwili, usuwając konto w Strefie Klienta. Możemy ją wypowiedzieć z 14-dniowym wyprzedzeniem z ważnych powodów (np. naruszenie regulaminu), informując o tym mailem. Umowa dotycząca formularza kontaktowego kończy się z chwilą wysłania wiadomości.</p>' +
    '<h4>§3 Zamówienie i zawarcie umowy</h4><p>Zamówienie może złożyć osoba pełnoletnia lub – w imieniu firmy – osoba do tego upoważniona. Do zamówienia potrzebne jest konto. Wybierasz usługę (kilka usług możesz połączyć w jednym terminie i jednej płatności), termin, podajesz dane i klikasz „Zamawiam z obowiązkiem zapłaty”. Termin jest zarezerwowany przez 35 minut na płatność; potem rezerwacja wygasa. Umowa zostaje zawarta z chwilą zaksięgowania płatności całej ceny. Potwierdzenie zamówienia z najważniejszymi informacjami wysyłamy e-mailem.</p>' +
    '<h4>§4 Ceny i płatności</h4><p>Ceny są cenami końcowymi w złotych polskich. Płacisz online przez operatora Stripe (karta, BLIK lub Przelewy24 – zależnie od dostępności). Za projekty (strony, automatyzacje) i zlecenia przyjęte poza stroną płacisz przelewem na rachunek bankowy wskazany na rachunku – w tytule przelewu podajesz numer rachunku i nazwę usługi; BLIK na telefon przyjmujemy wyłącznie przy osobistym oddaniu sprzętu. Nie przyjmujemy płatności gotówką. Za wszystkie usługi i komputery na zamówienie płacisz 100% ceny z góry, przed rozpoczęciem prac (przy komputerze na zamówienie – po akceptacji wyceny). Nie pobieramy zaliczek. Sprzedawca korzysta ze zwolnienia podmiotowego z VAT (art. 113 ust. 1 ustawy o VAT), więc ceny nie zawierają VAT. Na Twoje żądanie wystawiamy rachunek, a jeśli o to poprosisz – fakturę bez VAT. Składając zamówienie, zgadzasz się na otrzymywanie rachunków i faktur w formie elektronicznej (PDF) na adres e-mail konta; zawsze możesz poprosić o wersję papierową. Cena „od” to cena zakresu podstawowego opisanego przy usłudze. Dodatkowe prace lub części wykonujemy wyłącznie po Twojej akceptacji wyceny – bez akceptacji płacisz tylko za zakres podstawowy.</p>' +
    '<h4>§5 Realizacja usług</h4><p>Usługi zdalne wykonujemy w zarezerwowanym terminie przez program RustDesk. Zapewniasz dostęp do komputera z uprawnieniami administratora i możesz przerwać sesję w każdej chwili. Usługi warsztatowe wymagają dostarczenia sprzętu osobiście lub kurierem; koszt wysyłki do nas ponosisz Ty, chyba że ustalimy inaczej. Opcja Express (+50 zł) dotyczy wybranych usług zdalnych i skraca minimalny czas do terminu do 2 godzin, o ile są wolne godziny. Prace nieodwracalne – aktualizację BIOS-u, delid, nałożenie ciekłego metalu – wykonujemy wyłącznie po Twojej wyraźnej zgodzie wyrażonej mailowo, po informacji o ryzyku i możliwej utracie gwarancji producenta. Jeśli nie możemy wykonać usługi w terminie, zaproponujemy nowy termin, a jeśli go nie przyjmiesz – zwrócimy całą wpłatę. Zmianę terminu z Twojej strony ustalamy mailowo.</p>' +
    SETS_TERMS +
    '<h4>§7 Prawo odstąpienia od umowy</h4><p>Konsument i przedsiębiorca na prawach konsumenta mogą odstąpić od umowy zawartej na odległość w terminie 14 dni bez podania przyczyny – zasady opisuje <button type="button" class="link" data-legal="withdrawal">pouczenie o odstąpieniu od umowy</button>. Prawo to nie przysługuje w przypadkach z art. 38 ustawy o prawach konsumenta, w szczególności gdy usługa została w pełni wykonana za Twoją wyraźną zgodą, a przed jej rozpoczęciem wiedziałeś, że po wykonaniu usługi utracisz prawo odstąpienia. O ewentualnym wyłączeniu prawa odstąpienia dla zestawu składanego według Twojej indywidualnej specyfikacji informujemy w ofercie, przed zawarciem umowy.</p>' +
    '<h4>§8 Reklamacje i odpowiedzialność</h4><p>Odpowiadamy za zgodność zestawu z umową na zasadach ustawy o prawach konsumenta (dla konsumentów – przez 2 lata od wydania) oraz za należyte wykonanie usług na zasadach Kodeksu cywilnego. Reklamację złożysz mailowo lub pisemnie – opis zasad: <button type="button" class="link" data-legal="returns">Zwroty i reklamacje</button>. Odpowiadamy w ciągu 14 dni. Gwarancja producenta części nie ogranicza tych uprawnień. Przed pracami zrób kopię ważnych danych – dbamy o nie, ale awaria sprzętu może zdarzyć się niezależnie od nas. Regulamin nie wyłącza ani nie ogranicza praw konsumentów wynikających z przepisów.</p>' +
    '<p><b>Gwarancja na montaż.</b> Na usługę montażu komputera (STRIKE Custom Assembly) udzielamy gwarancji na 3 miesiące od wydania komputera, na terenie Polski. Gwarantem jest sprzedawca wskazany w §1. W tym czasie bezpłatnie usuwamy usterki wynikające z montażu – np. źle podłączone lub poluzowane przewody i podzespoły, mocowania, ułożenie kabli albo ustawienia BIOS wprowadzone przy montażu. Gwarancja nie obejmuje wad samych części (odpowiada za nie ich sprzedawca lub producent – pomożemy w zgłoszeniu), uszkodzeń mechanicznych, zalania ani zmian wprowadzonych przez Ciebie lub osoby trzecie. Usterkę zgłosisz na czacie w Strefie Klienta albo mailowo, podając numer zlecenia; odpowiadamy w ciągu 3 dni roboczych, a uznaną usterkę usuwamy w ciągu 14 dni od dostarczenia komputera. Gdy usterka wynika z montażu, koszt odesłania komputera do Ciebie pokrywamy my. Gwarancja nie wyłącza, nie ogranicza ani nie zawiesza Twoich uprawnień z tytułu niezgodności usługi z umową.</p>' +
    '<h4>§9 Program poleceń i kody rabatowe</h4><p>Zasady: <button type="button" class="link" data-legal="referral">Program poleceń</button>. Jedno zamówienie – jeden kod.</p>' +
    '<h4>§10 Pozasądowe rozwiązywanie sporów</h4><p>Konsument może skorzystać z bezpłatnej pomocy miejskiego lub powiatowego rzecznika konsumentów albo zwrócić się do Wojewódzkiego Inspektoratu Inspekcji Handlowej o mediację lub rozpoznanie sprawy przez stały polubowny sąd konsumencki. Informacje: prawakonsumenta.uokik.gov.pl. Udział w takim postępowaniu jest dobrowolny dla obu stron.</p>' +
    '<h4>§11 Dane osobowe</h4><p>Zasady opisuje <button type="button" class="link" data-legal="privacy">Polityka Prywatności</button>.</p>' +
    '<h4>§12 Postanowienia końcowe</h4><p>Umowy zawieramy w języku polskim i stosujemy do nich prawo polskie; nie pozbawia to konsumenta ochrony, jaką dają mu bezwzględnie obowiązujące przepisy państwa jego zwykłego pobytu. Regulamin możemy zmienić z ważnych przyczyn (zmiana przepisów, zakresu usług lub sposobu płatności). Posiadaczy kont informujemy o zmianach mailowo co najmniej 14 dni wcześniej; zamówienia złożone wcześniej realizujemy według dotychczasowej wersji.</p>' },
  withdrawal: { t: 'Odstąpienie od umowy', h: DRAFT_NOTE +
    '<h4>Pouczenie o prawie odstąpienia od umowy</h4><p>Masz prawo odstąpić od umowy w terminie 14 dni bez podania jakiejkolwiek przyczyny. Termin do odstąpienia wygasa po upływie 14 dni od dnia zawarcia umowy – w przypadku usług, albo od dnia, w którym Ty lub wskazana przez Ciebie osoba trzecia inna niż przewoźnik weszła w posiadanie rzeczy – w przypadku zestawu komputerowego.</p>' +
    `<p>Aby skorzystać z prawa odstąpienia, poinformuj nas (${SELLER}) o swojej decyzji w drodze jednoznacznego oświadczenia, np. pisma wysłanego pocztą lub e-mailem na ${MAIL}. Możesz skorzystać ze wzoru formularza poniżej, ale nie jest to obowiązkowe. Aby zachować termin, wystarczy wysłać oświadczenie przed jego upływem.</p>` +
    '<h4>Skutki odstąpienia</h4><p>Zwracamy wszystkie otrzymane od Ciebie płatności, w tym koszty dostarczenia rzeczy (z wyjątkiem dodatkowych kosztów wynikających z wybranego przez Ciebie sposobu dostarczenia innego niż najtańszy oferowany przez nas), niezwłocznie, a w każdym razie nie później niż 14 dni od dnia otrzymania Twojego oświadczenia. Zwrot wykonujemy tym samym sposobem płatności, którego użyłeś, chyba że wyraźnie zgodzisz się na inny. Nie ponosisz z tego tytułu żadnych opłat.</p>' +
    `<p>Przy zestawie komputerowym możemy wstrzymać się ze zwrotem płatności do chwili otrzymania rzeczy lub dowodu jej odesłania – w zależności od tego, co nastąpi wcześniej. Odeślij rzecz na adres ${RETURN_ADDR} niezwłocznie, nie później niż 14 dni od dnia odstąpienia. Ponosisz bezpośrednie koszty zwrotu rzeczy. Odpowiadasz za zmniejszenie wartości rzeczy wynikające z korzystania z niej w sposób wykraczający poza konieczny do stwierdzenia jej charakteru, cech i funkcjonowania.</p>` +
    '<h4>Usługa rozpoczęta na Twoje żądanie</h4><p>Jeżeli zażądałeś rozpoczęcia usługi przed upływem terminu do odstąpienia, a potem odstąpisz od umowy, zapłacisz kwotę proporcjonalną do zakresu świadczeń spełnionych do chwili, w której poinformowałeś nas o odstąpieniu. Jeżeli usługa zostanie w pełni wykonana za Twoją wyraźną zgodą, a przed jej rozpoczęciem wiedziałeś o utracie prawa odstąpienia, prawo to wygasa.</p>' +
    `<h4>Wzór formularza odstąpienia od umowy</h4><p><em>(formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)</em></p><p><em>Adresat: ${SELLER}</em></p><p><em>Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy sprzedaży następujących rzeczy(*) / umowy o świadczenie następującej usługi(*): …………<br>Numer zamówienia (STL-…): …………<br>Data zawarcia umowy(*) / odbioru(*): …………<br>Imię i nazwisko konsumenta(-ów): …………<br>Adres konsumenta(-ów): …………<br>Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej): …………<br>Data: …………</em></p><p><em>(*) Niepotrzebne skreślić.</em></p>` },
  returns: { t: 'Zwroty i reklamacje', h: DRAFT_NOTE +
    `<p class="note">Wersja z ${LEGAL_VERSION}.</p>` +
    '<h4>Kiedy oddajemy pieniądze</h4><ul>' +
    '<li><b>Płatność przerwana</b> – nic nie płacisz, a termin wraca do kalendarza.</li>' +
    '<li><b>Odstąpienie od umowy w ciągu 14 dni</b> (konsument i przedsiębiorca na prawach konsumenta) – zwracamy całą wpłatę; jeśli na Twoje żądanie zaczęliśmy usługę wcześniej, potrącamy tylko część odpowiadającą wykonanemu zakresowi. Szczegóły: <button type="button" class="link" data-legal="withdrawal">pouczenie o odstąpieniu</button>.</li>' +
    '<li><b>Nie wykonamy usługi w terminie</b> – proponujemy nowy termin, a jeśli go nie przyjmiesz, zwracamy całą wpłatę.</li>' +
    '<li><b>Nie zaakceptujesz zmiany podzespołu w zestawie</b> – możesz zrezygnować i otrzymasz zwrot całej wpłaty.</li>' +
    '<li><b>Uznana reklamacja</b> – jeśli prowadzi do obniżenia ceny lub odstąpienia od umowy, zwracamy należną kwotę.</li></ul>' +
    '<p>Zwrot wysyłamy w ciągu 14 dni, tą samą metodą, którą zapłaciłeś (przez Stripe). Czas zaksięgowania zależy od Twojego banku lub operatora karty.</p>' +
    `<h4>Jak oddać zestaw lub odesłać sprzęt</h4><p>Napisz najpierw na ${MAIL} z numerem zamówienia STL-…, a potem odeślij rzecz na adres ${RETURN_ADDR} albo przekaż ją osobiście w uzgodnionym terminie. Przy odstąpieniu od umowy koszt odesłania ponosisz Ty; przy uzasadnionej reklamacji – my.</p>` +
    `<h4>Jak złożyć reklamację</h4><p>Napisz na ${MAIL} albo wyślij pismo na adres ${fill(CO.ADDRESS, 'adres')}. Podaj numer zamówienia, opis problemu, datę jego zauważenia i czego oczekujesz. Odpowiemy w ciągu 14 dni od otrzymania reklamacji.</p>` +
    '<h4>Twoje uprawnienia</h4><ul><li><b>Zestaw komputerowy niezgodny z umową</b> (konsument i przedsiębiorca na prawach konsumenta, przez 2 lata od wydania) – możesz żądać naprawy lub wymiany, a gdy to niemożliwe, nie nastąpiło w rozsądnym czasie albo niezgodność jest istotna – obniżenia ceny lub odstąpienia od umowy.</li><li><b>Usługa wykonana wadliwie</b> – możesz żądać ponownego, prawidłowego wykonania lub usunięcia wady, a na zasadach Kodeksu cywilnego – obniżenia ceny lub odstąpienia od umowy.</li><li>Gwarancja producenta części działa niezależnie od tych uprawnień.</li></ul>' },
  referral: { t: 'Program poleceń', h:
    '<ul><li>Każde konto ma swój kod polecający (Strefa Klienta → Polecenia i kody).</li><li>Nowy klient (bez wcześniejszego opłaconego zamówienia) dostaje <b>10% rabatu</b> (maks. 300 zł) po wpisaniu kodu polecającego.</li><li>Polecający dostaje jednorazowy kod <b>5% rabatu</b> (maks. 300 zł, ważny 12 miesięcy) po zakończeniu zlecenia poleconego klienta i upływie 14 dni na ewentualne odstąpienie. Kod przychodzi mailem i jest widoczny w Strefie Klienta.</li><li>Nie można polecać samego siebie (to samo konto, ten sam adres e-mail lub jego aliasy, ten sam numer telefonu).</li><li>Kody się nie łączą: jedno zamówienie – jeden kod. Rabat obejmuje cenę usługi lub zestawu, nie opcję Express.</li><li>Kod nie podlega wymianie na gotówkę. Gdy zamówienie zostanie anulowane lub zwrócone, nagroda polecającego przepada.</li><li>Link polecający udostępniaj tylko osobom, które się na to zgadzają – nie wysyłaj go masowo ani jako spamu.</li></ul>' },
  prices: { t: 'Ceny i Omnibus', h:
    '<p>Ceny są cenami końcowymi w złotych polskich. Cena „od” oznacza cenę minimalną dla zakresu podstawowego opisanego przy usłudze; dodatkowe prace lub części (np. pady termiczne, pasta premium, naprawa po diagnostyce) wyceniamy i wykonujemy dopiero po Twojej akceptacji. Ceny zestawów komputerowych są orientacyjne – wiążącą cenę podajemy w ofercie. Ostateczną kwotę zamówienia wylicza system na podstawie aktualnego cennika i widzisz ją przed płatnością.</p>' +
    '<p>Gdy obniżamy cenę, obok podajemy najniższą cenę obowiązującą w ciągu 30 dni przed obniżką.</p>' },
};
function openLegal(key) {
  const d = LEGAL[key]; if (!d) return;
  $('#legalTitle').textContent = d.t; $('#legalBody').innerHTML = d.h;
  const m = $('#legalModal'); if (!m.open) m.showModal();
}

/* ------------------------------------------------------------------ animacja poglądowa przed/po (bez liczb – to nie jest pomiar) */
function initBenchmark() {
  $('#pBefore').replaceChildren(h('span', { class: 'tag', text: 'PRZED · ilustracja' }));
  $('#pAfter').replaceChildren(h('span', { class: 'tag', text: 'PO · ilustracja' }));
  $('#game').addEventListener('change', () => setBenchVideo($('#game').value));
  $('#slider').addEventListener('input', (e) => $('#cmp').style.setProperty('--pos', `${e.target.value}%`));
  initBenchScene();
}

/* ------------------------------------------------------------------ efekty: pojawianie się przy przewijaniu, liczniki, scena benchmarku */
const REVEAL_SEL = '[data-page] .section-head, .kpi, .tile, .set, .svc, .gal-strip, .bench > *, .budget-bar, .areas > *, .steps-grid > *, .cat-tabs';
let revealIO = null;
function reveal(root = document) {
  if (!revealIO) return;
  $$(REVEAL_SEL, root).forEach((el) => {
    if (el.classList.contains('rv') || el.closest('#panel')) return;
    const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    el.style.setProperty('--d', `${Math.min(sib, 6) * 70}ms`);
    el.classList.add('rv'); revealIO.observe(el);
  });
}
function countUp(el) {
  const m = /^([^\d−-]*)([−-]?)(\d+)(.*)$/.exec(el.textContent.trim()); if (!m) return;
  const [, pre, sign, num, post] = m, end = +num, t0 = performance.now(), dur = 1100;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = `${pre}${sign}${Math.round(end * e)}${post}`; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function initEffects() {
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('fx');
  revealIO = new IntersectionObserver((es) => es.forEach((x) => {
    if (!x.isIntersecting) return;
    x.target.classList.add('in'); revealIO.unobserve(x.target);
    if (x.target.classList.contains('kpi')) { const b = x.target.querySelector('b'); if (b && /\d/.test(b.textContent)) countUp(b); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  reveal();
  new MutationObserver((ms) => { if (ms.some((m) => m.addedNodes.length)) reveal(); }).observe($('main') || document.body, { childList: true, subtree: true });
  // delikatny „tilt” kart zestawów za kursorem
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.('.set, .tile'); if (!c || e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`); c.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
    c.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`); c.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { const c = e.target.closest?.('.set, .tile'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } }, { passive: true });
}

/* Scena za suwakiem PRZED/PO: film z gry (media/media.json → benchmark) albo animowana scena zastępcza.
   PRZED: rwany obraz (mało klatek) z czerwonym filtrem. PO: płynny obraz. */
/* Animacja poglądowa PRZED/PO: telemetria jak w nakładce do pomiarów – czas klatki na żywo, temperatura, płynność.
   Bez liczb: to ilustracja tego, czego szukamy i co poprawiamy, a nie wynik pomiaru. */
const BENCH_VIS = (() => {
  const GAMES = { cs2: 'Counter-Strike 2', val: 'Valorant', fn: 'Fortnite', wz: 'Call of Duty: Warzone', apex: 'Apex Legends' };
  const TUNE = { cs2: [0.55, 1.0], val: [0.5, 0.9], fn: [0.7, 1.15], wz: [0.85, 1.3], apex: [0.75, 1.2] };   // [poziom bazowy, częstość przycięć]
  const hash = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
  const smooth = (i) => { const a = Math.floor(i), f = i - a, u = f * f * (3 - 2 * f); return hash(a) * (1 - u) + hash(a + 1) * u; };
  /** czas klatki (0..1 skali wykresu) dla próbki k */
  function ft(k, before, game) {
    const [lvl, sp] = TUNE[game] || TUNE.cs2;
    if (!before) return 0.13 + 0.035 * smooth(k * 0.15) + 0.012 * hash(k * 3.1);
    let v = 0.27 * lvl + 0.1 * smooth(k * 0.11) + 0.06 * hash(k * 1.7);
    const h = hash(k * 0.913 + 5);
    if (h > 1 - 0.06 * sp) v += 0.32 + 0.3 * hash(k + 11);          // duże przycięcie
    else if (h > 1 - 0.16 * sp) v += 0.12 + 0.1 * hash(k + 3);      // mniejszy skok
    return Math.min(0.97, v);
  }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
  function draw(game, x, t, W, H, before) {
    const red = '#ff4d4d', gold = '#FFBB00', col = before ? red : gold;
    // tło z siatką
    const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, before ? '#1a0d0e' : '#0f0d07'); bg.addColorStop(1, '#070708');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.045)'; x.lineWidth = 1;
    for (let gx = (-(t / 40) % 32); gx < W; gx += 32) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
    for (let gy = 0; gy < H; gy += 32) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    const pad = Math.max(16, W * 0.03), fs = Math.max(11, Math.min(14, W / 55));
    x.font = `700 ${fs}px "Plus Jakarta Sans", system-ui, sans-serif`; x.textBaseline = 'alphabetic';
    // nagłówek
    x.fillStyle = 'rgba(255,255,255,.55)'; x.textAlign = 'right';
    x.fillText(`${GAMES[game] || GAMES.cs2} · ta sama scena`, W - pad, pad + fs + 34);
    x.textAlign = 'left';
    // --- wykres czasu klatki
    const gTop = pad + fs + 48, gH = H * 0.5, gB = gTop + gH, n = 140, dx = W / (n - 1), k0 = t / 33;
    x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText('Czas klatki', pad, gTop - 8);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.font = `600 ${fs * 0.85}px "Plus Jakarta Sans", system-ui, sans-serif`;
    x.textAlign = 'right'; x.fillText('↑ przycięcia', W - pad, gTop + fs); x.fillText('↓ płynnie', W - pad, gB - 6); x.textAlign = 'left';
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.setLineDash([4, 6]); x.beginPath(); x.moveTo(0, gB - gH * 0.18); x.lineTo(W, gB - gH * 0.18); x.stroke(); x.setLineDash([]);
    const pts = []; for (let i = 0; i < n; i++) { const k = Math.floor(k0) - (n - 1 - i); pts.push([i * dx - (k0 % 1) * dx, gB - ft(k, before, game) * gH]); }
    const area = x.createLinearGradient(0, gTop, 0, gB); area.addColorStop(0, before ? 'rgba(255,77,77,.35)' : 'rgba(255,187,0,.28)'); area.addColorStop(1, 'rgba(0,0,0,0)');
    x.beginPath(); x.moveTo(pts[0][0], gB); for (const [px, py] of pts) x.lineTo(px, py); x.lineTo(pts[n - 1][0], gB); x.closePath(); x.fillStyle = area; x.fill();
    x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.strokeStyle = col; x.lineWidth = 2; x.shadowColor = col; x.shadowBlur = 10; x.stroke(); x.shadowBlur = 0;
    // --- paski: temperatura i płynność (1% low)
    const bars = [
      ['Temperatura GPU', before ? 0.9 + 0.03 * Math.sin(t / 700) : 0.6 + 0.015 * Math.sin(t / 900), before ? 'za wysoka – zegary spadają' : 'w normie'],
      ['Płynność (1% low)', before ? 0.38 + 0.08 * smooth(t / 600) : 0.9 + 0.02 * Math.sin(t / 800), before ? 'nierówna' : 'równa'],
    ];
    let y = gB + Math.max(26, H * 0.07);
    const bh = Math.max(8, H * 0.025);
    x.font = `700 ${fs}px "Plus Jakarta Sans", system-ui, sans-serif`;
    for (const [label, v, note] of bars) {
      x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText(label, pad, y);
      x.fillStyle = before ? 'rgba(255,120,120,.85)' : 'rgba(255,214,110,.85)'; x.textAlign = 'right'; x.fillText(note, W - pad, y); x.textAlign = 'left';
      rr(x, pad, y + 8, W - pad * 2, bh, bh / 2); x.fillStyle = 'rgba(255,255,255,.08)'; x.fill();
      const g = x.createLinearGradient(pad, 0, W - pad, 0);
      if (before) { g.addColorStop(0, '#ff8a3d'); g.addColorStop(1, red); } else { g.addColorStop(0, '#ffd25e'); g.addColorStop(1, gold); }
      rr(x, pad, y + 8, (W - pad * 2) * Math.max(0.02, Math.min(1, v)), bh, bh / 2); x.fillStyle = g; x.fill();
      y += bh + Math.max(30, H * 0.085);
    }
  }
  return { draw };
})();

const Scene = { vid: null, file: '', running: false, visible: false, game: 'cs2' };
function benchVideoFor(game) { return mediaGet(`benchmark.${game}`) || mediaGet('benchmark.domyslny') || ''; }
function setBenchVideo(game) {
  Scene.game = game || 'cs2';
  const f = benchVideoFor(game);
  if (f === Scene.file) return;
  Scene.file = f;
  if (Scene.vid) { Scene.vid.pause(); Scene.vid.removeAttribute('src'); Scene.vid.load(); Scene.vid = null; }
  $('#cmp')?.classList.toggle('has-video', !!f);
  if (!f || !isVideo(f)) return;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = mediaUrl(f);
  v.addEventListener('error', () => { Scene.vid = null; $('#cmp')?.classList.remove('has-video'); });
  Scene.vid = v;
  if (Scene.visible && !reduceMotion()) v.play().catch(() => {});
}
function initBenchScene() {
  const box = $('#cmp'), cb = $('#cmpBefore'), ca = $('#cmpAfter'); if (!box || !cb?.getContext) return;
  const xb = cb.getContext('2d'), xa = ca.getContext('2d');
  let W = 0, H = 0, dpr = 1, lastB = 0, hitch = 0;
  const resize = () => { const r = box.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; for (const c of [cb, ca]) { c.width = Math.max(1, W * dpr); c.height = Math.max(1, H * dpr); } draw(performance.now(), true); };
  const drawVideo = (x, v) => {
    const vw = v.videoWidth, vh = v.videoHeight, s = Math.max(W / vw, H / vh);
    x.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
  };
  const drawSynth = (x, t, before) => BENCH_VIS.draw(Scene.game, x, t, W, H, before);   // telemetria poglądowa
  const frame = (x, t, before) => {
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vid = Scene.vid && Scene.vid.readyState >= 2;
    if (vid) drawVideo(x, Scene.vid); else drawSynth(x, t, before);
    if (before && vid) {
      x.fillStyle = 'rgba(255,30,30,.22)'; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, W, H);
    }
  };
  function draw(now, force = false) {
    if (!W) return;
    frame(xa, now, false);
    // PRZED: ok. 20 klatek/s i co jakiś czas „przycięcie” (stutter)
    if (force || now - lastB > 50 + hitch) { frame(xb, now - 120, true); lastB = now; hitch = Math.random() < 0.08 ? 180 : 0; }
  }
  const loop = (now) => { if (!Scene.running) return; draw(now); requestAnimationFrame(loop); };
  const start = () => { if (Scene.running || reduceMotion()) return; Scene.running = true; Scene.vid?.play().catch(() => {}); requestAnimationFrame(loop); };
  const stop = () => { Scene.running = false; Scene.vid?.pause(); };
  new ResizeObserver(resize).observe(box);
  new IntersectionObserver((es) => es.forEach((e) => { Scene.visible = e.isIntersecting; e.isIntersecting && document.visibilityState === 'visible' ? start() : stop(); })).observe(box);
  document.addEventListener('visibilitychange', () => { document.visibilityState === 'visible' && Scene.visible ? start() : stop(); });
  resize();
}

/* ------------------------------------------------------------------ interfejs ogólny */
function tabKeys(list) {
  list.addEventListener('keydown', (e) => {
    const tabs = $$('[role=tab]', list).filter((t) => !t.classList.contains('hidden'));
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]; if (n === undefined) return;
    e.preventDefault(); const t = tabs[(n + tabs.length) % tabs.length]; t.focus(); t.click();
  });
}
function initChrome() {
  $('#year').textContent = new Date().getFullYear();
  const burger = $('.burger'), nav = $('#mainnav');
  const setMenu = (o) => { nav.classList.toggle('open', o); burger.setAttribute('aria-expanded', String(o)); burger.setAttribute('aria-label', o ? 'Zamknij menu' : 'Otwórz menu'); };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); } });
  $$('#mainnav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  tabKeys($('#panelTabs')); tabKeys($('#authTabs')); tabKeys($('#svcCats'));
  renderCompany();
  const hdr = $('.site-header'); const onScroll = () => hdr.classList.toggle('scrolled', scrollY > 8); onScroll(); addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href');
    if (a.hasAttribute('data-link')) {
      e.preventDefault();
      navigate(href); return;
    }
    if (href.startsWith('#') && href.length > 1) { e.preventDefault(); const t = document.getElementById(href.slice(1)); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); } }
  });
  $$('.acc').forEach((acc) => acc.addEventListener('click', (e) => {
    const b = e.target.closest('.acc-btn'); if (!b) return; const was = b.getAttribute('aria-expanded') === 'true';
    if (acc.hasAttribute('data-single')) $$('.acc-btn', acc).forEach((x) => x.setAttribute('aria-expanded', 'false'));
    b.setAttribute('aria-expanded', String(!was));
  }));
  document.addEventListener('click', (e) => {
    const l = e.target.closest('[data-legal]'); if (l) { e.preventDefault(); openLegal(l.dataset.legal); }
    const a = e.target.closest('[data-auth]'); if (a) openAuth(a.dataset.auth);
  });
  $$('dialog.modal').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  $$('#authTabs .tab').forEach((t) => t.addEventListener('click', () => openAuth(t.dataset.mode, '', false)));
  $('#authForm').addEventListener('submit', submitAuth);
  $$('#panelTabs .tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('#contactForm').addEventListener('submit', submitContact);
  // stare adresy z # (linki w mailach, zakładki) -> nowe podstrony
  // linki do dokumentów prawnych (np. z maili): /#regulamin, /#polityka-prywatnosci, /#cookies, /#odstapienie, /#zwroty
  const LEGAL_HASH = { '#regulamin': 'terms', '#polityka-prywatnosci': 'privacy', '#cookies': 'cookies', '#odstapienie': 'withdrawal', '#zwroty': 'returns' };
  const legalDoc = LEGAL_HASH[location.hash];
  if (legalDoc) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => openLegal(legalDoc), 50); }
  const legacy = LEGACY_HASH[location.hash];
  if (legacy) { const terms = location.hash === '#prawne'; history.replaceState(null, '', BASE + legacy.slice(1) + location.search); if (terms) setTimeout(() => openLegal('terms'), 50); }
  renderRoute(true);
}

/* ------------------------------------------------------------------ start */
async function boot() {
  bindGate();
  initChrome(); initBenchmark(); initEffects(); bindBooking(); restoreDraft();
  setMotion(document.documentElement.classList.contains('paused'), false);
  $('#budget')?.addEventListener('input', renderBudget);
  loadMedia();
  $$('a.tile[data-from]').forEach((a) => a.addEventListener('click', () => { if (a.dataset.from !== 'pc') showCat(a.dataset.from); }));
  staticCatalog(); renderCatalog(); setBookMode(B.mode, { save: false });
  const cfg = resolveConfig();
  if (!cfg) {
    setConn('config', 'Uzupełnij SUPABASE_URL i SUPABASE_KEY w konfiguracji na górze pliku index.html.');
    log('brak konfiguracji serwera – tryb katalogu'); refreshSummary(); renderConsole(); window.stlIntroDone?.(); return;
  }
  setConn('connecting'); log('ładuję bibliotekę połączenia');
  let createClient;
  for (let i = 0; i < 4 && !createClient; i++) {
    try { createClient = await loadSupabaseLib(); }
    catch { setConn('connecting'); await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  if (!createClient) { window.stlIntroDone?.(); setConn('offline', 'Kalendarz rezerwacji jest chwilowo niedostępny. Odśwież stronę za chwilę albo napisz do nas.'); addEventListener('online', () => location.reload(), { once: true }); return; }
  sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: AUTH_STORE }, realtime: { params: { eventsPerSecond: 5 } } });
  loadProviders(cfg);
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') { authMode = 'newpass'; setTimeout(() => openAuth('newpass'), 50); }
    setTimeout(() => onSession(s), 0);                // poza wywołaniem zwrotnym (zalecenie supabase-js)
  });
  await heartbeat();
  await loadCatalog();
  window.stlIntroDone?.();
  loadReviews();
  if (B.item) { $('#bItem').value = B.item; onItemChange(true); }
  const { data } = await sb.auth.getSession(); await onSession(data.session);
  authKnown = true;
  if (route === '/rezerwacja' && !session) askLogin('booking');
  const czat = new URLSearchParams(location.search).get('czat');   // link z powiadomienia push w Centrum
  if (czat) {
    const q = new URLSearchParams(location.search); q.delete('czat'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    if (!session) askLogin('chat', { title: 'Zaloguj się, żeby odczytać wiadomość' });
    else if (isAdmin && /^[0-9a-f-]{36}$/i.test(czat)) { initAdvisor(); chatOpenClient(czat); }
    else chatOpen('msgs');
  }
  await handleStripeReturn();
  findNextFree(); refreshSummary();
}
boot().catch((e) => { console.error(e); toast('err', 'Wystąpił błąd strony. Odśwież ją.'); }).finally(() => window.stlIntroDone?.());
