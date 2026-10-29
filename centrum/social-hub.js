/* =====================================================================
   STL Centrum – Social Hub (v16)
   Zakładka Social dostaje 4 widoki:
     • Do publikacji – dotychczasowa kolejka (app.js, bez zmian)
     • Opublikowane  – WSZYSTKIE posty z Facebooka, Instagrama i TikToka (także dodane ręcznie) + statystyki
     • Kalendarz     – miesiąc: co wyszło i co jest zaplanowane, na wszystkich platformach
     • Konta         – łączenie kont jednym przyciskiem (Meta: Facebook + Instagram, TikTok)
   Moduł jest niezależny od app.js: korzysta z tej samej sesji logowania (localStorage),
   tylko czyta dane (RLS: wyłącznie admin) i woła funkcje social-connect / social-sync.
   Teksty z platform wstawiane są przez textContent (bez innerHTML).
   ===================================================================== */
const CFG = window.STL_CENTRUM || {};
const TZ = 'Europe/Warsaw';
const AUTH_KEY = 'stl-centrum-auth';

/* ------------------------------------------------------------------ narzędzia */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const nf = new Intl.NumberFormat('pl-PL', { notation: 'compact', maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat('pl-PL');
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v >= 10000 ? nf.format(v) : n0.format(v));
const fmt = (iso, o = { dateStyle: 'medium', timeStyle: 'short' }) => (iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TZ, ...o }) : '–');
const dayKeyOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const todayKey = () => dayKeyOf(new Date());
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const ago = (iso) => { if (!iso) return 'nigdy'; const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'przed chwilą'; if (s < 3600) return `${Math.round(s / 60)} min temu`; if (s < 86400) return `${Math.round(s / 3600)} h temu`; return fmt(iso, { day: 'numeric', month: 'short' }); };
const vibrate = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

function toast(kind, text, ms = 5000) {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, h('span', { text }), h('button', { 'aria-label': 'Zamknij', text: '×', onclick: () => t.remove() }));
  $('#toasts')?.append(t); if (ms) setTimeout(() => t.remove(), ms);
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), ' ', label || 'Chwileczkę…'); }
  else { btn.disabled = false; btn.textContent = label || btn.dataset.label || ''; }
}
/** replaceChildren z pominięciem pustych elementów i spłaszczeniem list */
const put = (box, ...items) => box.replaceChildren(...items.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
function openSheet(title, ...content) {
  const sheet = $('#sheet');
  $('#sheetTitle').textContent = title;
  $('#sheetBody').replaceChildren(...content.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  if (!sheet.open) sheet.showModal();
}

/* ------------------------------------------------------------------ backend (ta sama sesja co app.js) */
function token() {
  try { const s = JSON.parse(localStorage.getItem(AUTH_KEY)); return s?.access_token || s?.currentSession?.access_token || null; } catch { return null; }
}
let lib = null, client = null, clientToken = null;
async function sb() {
  const tok = token();
  if (!tok) throw new Error('Zaloguj się ponownie.');
  if (client && clientToken === tok) return client;
  lib ||= await import(CFG.SUPABASE_JS);
  // osobny klient bez własnej sesji: zawsze z aktualnym tokenem z app.js (odświeżanym przez app.js)
  client = lib.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'stl-hub' },
    global: { headers: { Authorization: `Bearer ${tok}` } },
  });
  clientToken = tok;
  return client;
}
async function callFn(name, body) {
  const c = await sb();
  const { data, error } = await c.functions.invoke(name, { body });
  if (error) {
    let p = {}; try { p = await error.context.json(); } catch { /* */ }
    const offline = error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError';
    const notDeployed = error.context?.status === 404;
    throw Object.assign(new Error(p.error || (notDeployed ? `Funkcja ${name} nie jest wdrożona.` : offline ? 'Brak połączenia z serwerem.' : 'Błąd serwera. Spróbuj ponownie.')), { code: p.code || (notDeployed ? 'NOT_DEPLOYED' : undefined) });
  }
  return data;
}

/* ------------------------------------------------------------------ słowniki */
const PF = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
const PF_ORDER = ['facebook', 'instagram', 'tiktok'];
const KIND = { post: 'Post', image: 'Zdjęcie', video: 'Wideo', reel: 'Reels', carousel: 'Karuzela', short: 'Wideo' };
const METRIC = [
  ['views', 'Wyświetlenia', '👁'], ['reach', 'Zasięg', '◎'], ['likes', 'Polubienia', '❤'], ['comments', 'Komentarze', '💬'],
  ['shares', 'Udostępnienia', '↗'], ['saves', 'Zapisania', '🔖'], ['clicks', 'Kliknięcia', '☝'], ['interactions', 'Interakcje razem', '⚡'],
];
const POST_STATUS = { ZATWIERDZONY: ['Zaplanowany', 'info'], PUBLIKACJA: ['Publikuję…', 'info'], W_APLIKACJI: ['Szkic w aplikacji TikTok', 'wait'], OPUBLIKOWANY: ['Opublikowany', 'ok'], BLAD: ['Błąd publikacji', 'bad'] };
const interactions = (m = {}) => m.interactions ?? ((m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0));

/* ------------------------------------------------------------------ stan */
const H = {
  view: 'queue', pf: 'all', days: 30, sort: 'new',
  feed: [], daily: [], accounts: [], cfg: null, cfgError: null,
  month: todayKey().slice(0, 8) + '01', sel: todayKey(), plan: { feed: [], ai: [] },
  loaded: new Set(), syncing: false,
};
const VIEWS = ['queue', 'feed', 'plan', 'accounts'];

/* ------------------------------------------------------------------ przełączanie widoków */
function setView(v, { load = true } = {}) {
  if (!VIEWS.includes(v)) v = 'queue';
  H.view = v;
  $$('#hubTabs [data-hub]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.hub === v)));
  $$('[data-hub-view]').forEach((el) => { el.hidden = el.dataset.hubView !== v; });
  try { localStorage.setItem('stl_hub_view', JSON.stringify(v)); } catch { /* */ }
  if (load && v !== 'queue' && socialVisible() && !H.loaded.has(v)) { H.loaded.add(v); reload(); }
}
const socialVisible = () => { const s = $('section[data-view="social"]'); return s && !s.hidden; };
function reload() {
  if (!token()) return;
  ({ feed: loadFeed, plan: loadPlan, accounts: loadAccounts })[H.view]?.().catch((e) => toast('err', e.message));
}

function platformChips(box, onChange, counts = {}) {
  box.replaceChildren(...[['all', 'Wszystkie'], ...PF_ORDER.map((p) => [p, PF[p]])].map(([k, label]) =>
    h('button', { class: `chip${k !== 'all' ? ` chip-${k}` : ''}`, role: 'tab', type: 'button', 'aria-selected': String(H.pf === k), onclick: () => { H.pf = k; vibrate(); onChange(); } },
      label, counts[k] !== undefined ? h('span', { class: 'n', text: String(counts[k]) }) : null)));
}

/* ================================================================== OPUBLIKOWANE + STATYSTYKI */
async function loadFeed() {
  const box = $('#hubFeed');
  if (!H.feed.length) box.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const c = await sb();
  const since = new Date(Date.now() - 95 * 864e5).toISOString();
  const [f, d, a] = await Promise.all([
    c.from('social_feed').select('*').gte('published_at', since).order('published_at', { ascending: false }).limit(600),
    c.from('social_account_daily').select('*').gte('day', addDays(todayKey(), -100)).order('day'),
    c.rpc('admin_social_accounts'),
  ]);
  if (f.error) { box.replaceChildren(h('div', { class: 'empty', text: /social_feed/.test(f.error.message) ? 'Uruchom migrację v16 (tabela social_feed nie istnieje).' : `Błąd: ${f.error.message}` })); return; }
  H.feed = f.data || []; H.daily = d.data || []; H.accounts = a.data || [];
  renderFeed();
}

function followersDelta(platform) {
  const rows = H.daily.filter((r) => r.platform === platform && r.followers !== null);
  if (!rows.length) return null;
  const last = rows[rows.length - 1], target = addDays(last.day, -30);
  const base = [...rows].reverse().find((r) => r.day <= target) || rows[0];
  return { now: last.followers, diff: last.followers - base.followers, since: base.day, last: last.day };
}

async function runSync(btn, platforms) {
  if (H.syncing) return;
  H.syncing = true; busy(btn, true, 'Pobieram…');
  try {
    const d = await callFn('social-sync', platforms ? { platforms } : {});
    const parts = Object.entries(d.report || {}).map(([p, r]) => r.ok ? `${PF[p]}: ${r.posts}` : `${PF[p]}: błąd`);
    if (!parts.length) toast('info', d.message || 'Żadne konto nie jest połączone.', 8000);
    else toast(d.ok ? 'ok' : 'err', `Pobrano posty – ${parts.join(' · ')}`, 8000);
    const errs = Object.entries(d.report || {}).filter(([, r]) => !r.ok);
    for (const [p, r] of errs) toast('err', `${PF[p]}: ${r.error}`, 12000);
    vibrate(20);
  } catch (e) { toast('err', e.message, 9000); }
  H.syncing = false; busy(btn, false, '↻ Pobierz z platform');
  H.loaded.clear(); H.loaded.add(H.view); reload();
}

function renderFeed() {
  const box = $('#hubFeed');
  const connected = H.accounts.filter((a) => a.connected);
  const lastSync = connected.map((a) => a.last_sync_at).filter(Boolean).sort().pop();
  const since = Date.now() - H.days * 864e5;
  const inPeriod = H.feed.filter((p) => new Date(p.published_at).getTime() >= since);
  const counts = { all: inPeriod.length }; for (const p of PF_ORDER) counts[p] = inPeriod.filter((x) => x.platform === p).length;
  const list = inPeriod.filter((p) => H.pf === 'all' || p.platform === H.pf);

  const sum = (k) => list.reduce((a, p) => a + (Number(p.metrics?.[k]) || 0), 0);
  const views = sum('views'), inter = list.reduce((a, p) => a + interactions(p.metrics), 0);
  const kpi = (label, val, extra) => h('div', { class: 'kpi hud' }, h('span', { text: label }), h('b', { text: val }), extra ? h('span', { class: 'delta muted', text: extra }) : null);

  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Platforma' });
  platformChips(chips, renderFeed, counts);
  const period = h('div', { class: 'seg3' }, [7, 30, 90].map((d) => h('button', { type: 'button', 'aria-pressed': String(H.days === d), text: `${d} dni`, onclick: () => { H.days = d; renderFeed(); } })));
  const sort = h('select', { class: 'select select-sm', 'aria-label': 'Sortowanie', onchange: (e) => { H.sort = e.target.value; renderFeed(); } },
    [['new', 'Najnowsze'], ['views', 'Najwięcej wyświetleń'], ['inter', 'Najwięcej interakcji']].map(([v, t]) => h('option', { value: v, text: t, selected: H.sort === v })));

  // obserwujący
  const fol = PF_ORDER.filter((p) => H.pf === 'all' || p === H.pf).map((p) => {
    const acc = H.accounts.find((a) => a.platform === p && a.connected);
    if (!acc) return null;
    const d = followersDelta(p);
    const value = d?.now ?? acc.followers;
    return h('div', { class: 'fol' }, h('span', { class: `pf ${p}`, text: PF[p] }), h('b', { text: value === null || value === undefined ? '–' : num(value) }), h('small', { text: 'obserwujących' }),
      d && d.since < d.last ? h('span', { class: `delta ${d.diff >= 0 ? 'up' : 'down'}`, text: `${d.diff >= 0 ? '+' : ''}${num(d.diff)} od ${fmt(`${d.since}T12:00:00Z`, { day: 'numeric', month: 'short' })}` }) : null);
  }).filter(Boolean);

  // porównanie platform (gdzie posty działają najlepiej)
  let compare = null;
  if (H.pf === 'all' && inPeriod.length) {
    const rows = PF_ORDER.map((p) => {
      const ps = inPeriod.filter((x) => x.platform === p);
      const v = ps.reduce((a, x) => a + (Number(x.metrics?.views) || 0), 0), i = ps.reduce((a, x) => a + interactions(x.metrics), 0);
      return { p, n: ps.length, v, i, avg: ps.length ? Math.round(v / ps.length) : 0 };
    }).filter((r) => r.n);
    const max = Math.max(1, ...rows.map((r) => r.avg));
    compare = h('div', { class: 'card' }, h('ul', { class: 'bars pf-bars' }, rows.map((r) => h('li', {},
      h('div', {}, h('span', { class: `pf ${r.p}`, text: PF[r.p] }), h('b', { text: `${num(r.avg)} wyśw./post · ${r.n} ${r.n === 1 ? 'post' : 'postów'} · ${num(r.i)} interakcji` })),
      h('i', { class: `bar-${r.p}`, style: `width:${Math.max(3, Math.round(r.avg / max * 100))}%` })))),
    h('p', { class: 'hint', style: 'margin:8px 0 0', text: 'Średnia liczba wyświetleń na post w wybranym okresie – tu widać, gdzie Twoje treści działają najlepiej.' }));
  }

  const sorted = [...list].sort((a, b) => H.sort === 'views' ? (Number(b.metrics?.views) || 0) - (Number(a.metrics?.views) || 0)
    : H.sort === 'inter' ? interactions(b.metrics) - interactions(a.metrics) : b.published_at.localeCompare(a.published_at));

  const syncBtn = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '↻ Pobierz z platform', disabled: !connected.length, onclick: (e) => runSync(e.currentTarget) });
  const top = h('div', { class: 'run-bar card' },
    h('div', {}, h('b', { text: connected.length ? `Połączone: ${connected.map((a) => PF[a.platform]).join(', ')}` : 'Brak połączonych kont' }),
      h('p', { text: connected.length ? `Ostatnie pobranie: ${ago(lastSync)} · automatycznie co 3 h` : 'Połącz konta w zakładce Konta – posty i statystyki pojawią się tutaj.' })),
    connected.length ? syncBtn : h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Połącz konta', onclick: () => setView('accounts') }));

  put(box, top, chips,
    h('div', { class: 'feed-tools' }, period, sort),
    h('div', { class: 'kpi-grid' },
      kpi('Posty', num(list.length), `${H.days} dni`),
      kpi('Wyświetlenia', num(views), list.length ? `śr. ${num(Math.round(views / list.length))} na post` : null),
      kpi('Interakcje', num(inter), 'polubienia, komentarze, udostępnienia, zapisania'),
      kpi('Zaangażowanie', views ? `${(inter / views * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%` : '–', 'interakcje / wyświetlenia')),
    fol.length ? h('div', { class: 'fol-row' }, fol) : null,
    compare ? [h('p', { class: 'sec-title', text: 'Porównanie platform' }), compare] : null,
    h('p', { class: 'sec-title', text: `Posty (${sorted.length})` }),
    sorted.length ? h('div', { class: 'list' }, sorted.map(feedCard))
      : h('div', { class: 'empty', text: H.feed.length ? 'Brak postów w tym okresie i na tej platformie.' : connected.length ? 'Jeszcze nic nie pobrano – kliknij „Pobierz z platform”.' : 'Połącz konta, aby zobaczyć tu swoje posty.' }));
}

function thumb(p, cls = 'fp-thumb') {
  const ph = () => h('div', { class: `${cls} ph ${p.platform}`, 'aria-hidden': 'true', text: PF[p.platform][0] });
  if (!p.thumbnail_url) return ph();
  const img = h('img', { class: cls, src: p.thumbnail_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(ph()), { once: true });   // linki z platform wygasają – odświeży je kolejne pobranie
  return img;
}
function metricLine(m = {}) {
  return h('div', { class: 'mline' }, METRIC.filter(([k]) => k !== 'interactions' && k !== 'clicks' && m[k] !== undefined).slice(0, 5)
    .map(([k, label, icon]) => h('span', { title: label }, h('i', { 'aria-hidden': 'true', text: icon }), num(m[k]))));
}
function feedCard(p) {
  return h('button', { class: 'card fp', type: 'button', onclick: () => feedSheet(p) },
    thumb(p),
    h('div', { class: 'fp-body' },
      h('div', { class: 'post-h' }, h('span', { class: `pf ${p.platform}`, text: PF[p.platform] }), p.kind ? h('span', { class: 'pill ghost', text: KIND[p.kind] || p.kind }) : null,
        p.ai_post_id ? h('span', { class: 'pill', text: 'z Centrum' }) : null, h('span', { class: 'when', text: fmt(p.published_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })),
      h('p', { class: 'fp-cap', text: p.caption || '(bez opisu)' }),
      metricLine(p.metrics)));
}
function feedSheet(p) {
  const m = p.metrics || {}, inter = interactions(m);
  const rows = METRIC.filter(([k]) => m[k] !== undefined).map(([k, label]) => h('div', {}, h('span', { text: label }), h('b', { text: n0.format(m[k]) })));
  if (m.views) rows.push(h('div', {}, h('span', { text: 'Zaangażowanie' }), h('b', { class: 'gold', text: `${(inter / m.views * 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%` })));
  if (m.avg_watch_ms) rows.push(h('div', {}, h('span', { text: 'Śr. czas oglądania' }), h('b', { text: `${(m.avg_watch_ms / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} s` })));
  if (m.duration_s) rows.push(h('div', {}, h('span', { text: 'Długość filmu' }), h('b', { text: `${m.duration_s} s` })));
  openSheet(`${PF[p.platform]} · ${fmt(p.published_at, { day: 'numeric', month: 'long' })}`,
    h('div', { class: 'fp-big' }, thumb(p, 'fp-hero')),
    h('div', { class: 'kv' }, rows.length ? rows : h('div', {}, h('span', { text: 'Statystyki' }), h('b', { text: 'jeszcze niedostępne (platforma podaje je z opóźnieniem do 48 h)' }))),
    h('h4', { text: 'Opis' }),
    h('p', { class: 'small', style: 'white-space:pre-wrap;margin:0', text: p.caption || '(bez opisu)' }),
    h('div', { class: 'post-actions' },
      p.permalink ? h('a', { class: 'btn btn-gold btn-sm', href: p.permalink, target: '_blank', rel: 'noopener', text: `Otwórz na ${PF[p.platform]} ↗` }) : null,
      p.ai_post_id ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Post z Centrum', onclick: () => { $('#sheet').close(); setView('queue'); } }) : null),
    h('p', { class: 'free-note', text: `${KIND[p.kind] || 'Post'} · statystyki z ${fmt(p.metrics_updated_at)}` }));
}

/* ================================================================== KALENDARZ POSTÓW */
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
function monthGrid(first) {
  const [y, m] = first.split('-').map(Number);
  const w = (new Date(Date.UTC(y, m - 1, 1, 12)).getUTCDay() + 6) % 7;   // poniedziałek = 0
  const start = addDays(first, -w);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
async function loadPlan() {
  const box = $('#hubPlan');
  if (!box.childElementCount) box.replaceChildren(h('div', { class: 'skeleton', style: 'height:320px' }));
  const cells = monthGrid(H.month), from = `${addDays(cells[0], -1)}T00:00:00Z`, to = `${addDays(cells[41], 2)}T00:00:00Z`;
  const c = await sb();
  const [f, a] = await Promise.all([
    c.from('social_feed').select('id,platform,external_id,ai_post_id,kind,caption,permalink,thumbnail_url,published_at,metrics,metrics_updated_at')
      .gte('published_at', from).lt('published_at', to).order('published_at').limit(1000),
    c.from('ai_posts').select('id,platform,format,status,topic,caption,scheduled_for,published_at,external_url,updated_at')
      .in('status', ['ZATWIERDZONY', 'PUBLIKACJA', 'W_APLIKACJI', 'OPUBLIKOWANY', 'BLAD'])
      .or(`and(scheduled_for.gte.${from},scheduled_for.lt.${to}),and(published_at.gte.${from},published_at.lt.${to})`).limit(1000),
  ]);
  if (f.error || a.error) { box.replaceChildren(h('div', { class: 'empty', text: `Błąd: ${(f.error || a.error).message}` })); return; }
  H.plan = { feed: f.data || [], ai: a.data || [] };
  renderPlan();
}
function planItems() {
  const linked = new Set(H.plan.feed.map((x) => x.ai_post_id).filter(Boolean));
  const items = [
    ...H.plan.feed.map((x) => ({ type: 'pub', at: x.published_at, platform: x.platform, row: x })),
    ...H.plan.ai.filter((x) => !linked.has(x.id)).map((x) => ({
      type: x.status === 'OPUBLIKOWANY' ? 'pubc' : 'plan', at: x.status === 'OPUBLIKOWANY' ? (x.published_at || x.scheduled_for) : (x.scheduled_for || x.published_at || x.updated_at), platform: x.platform, row: x,
    })),
  ].filter((x) => x.at && (H.pf === 'all' || x.platform === H.pf));
  const byDay = new Map();
  for (const it of items) { const k = dayKeyOf(new Date(it.at)); (byDay.get(k) || byDay.set(k, []).get(k)).push(it); }
  for (const v of byDay.values()) v.sort((x, y) => x.at.localeCompare(y.at));
  return byDay;
}
function renderPlan() {
  const box = $('#hubPlan');
  const [y, m] = H.month.split('-').map(Number);
  const cells = monthGrid(H.month), byDay = planItems(), today = todayKey(), inMonth = (k) => k.slice(0, 7) === H.month.slice(0, 7);
  const monthItems = [...byDay.entries()].filter(([k]) => inMonth(k)).flatMap(([, v]) => v);
  const shift = (d) => { const nd = new Date(Date.UTC(y, m - 1 + d, 1, 12)); H.month = nd.toISOString().slice(0, 8) + '01'; H.sel = inMonth(today) && d === 0 ? today : H.month; loadPlan(); };
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Platforma' }); platformChips(chips, renderPlan);

  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': `${MONTHS[m - 1]} ${y}` },
    ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map((d) => h('span', { class: 'cal-dow', text: d })),
    cells.map((k) => {
      const its = byDay.get(k) || [];
      const pubs = its.filter((x) => x.type !== 'plan'), plans = its.filter((x) => x.type === 'plan');
      return h('button', { type: 'button', class: `cal-cell${inMonth(k) ? '' : ' out'}${k === today ? ' today' : ''}${plans.length ? ' has-plan' : ''}`,
        'aria-pressed': String(k === H.sel), 'aria-label': `${k}: ${pubs.length} opublikowanych, ${plans.length} zaplanowanych`,
        onclick: () => { H.sel = k; renderPlan(); } },
      h('b', { text: String(+k.slice(8)) }),
      its.length ? h('span', { class: 'dots' }, its.slice(0, 4).map((x) => h('i', { class: `d-${x.platform}${x.type === 'plan' ? ' ring' : ''}` })), its.length > 4 ? h('em', { text: `+${its.length - 4}` }) : null) : null);
    }));

  const sel = byDay.get(H.sel) || [];
  const dayList = sel.length ? h('div', { class: 'list' }, sel.map(planCard))
    : h('div', { class: 'empty', text: H.sel < today ? 'Tego dnia nic nie wyszło.' : 'Nic nie zaplanowano na ten dzień. Zatwierdź post z terminem w „Do publikacji”.' });

  put(box, 
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Poprzedni miesiąc', text: '‹', onclick: () => shift(-1) }),
      h('div', {}, h('b', { text: `${MONTHS[m - 1]} ${y}` }), h('small', { text: `${monthItems.filter((x) => x.type !== 'plan').length} opublikowanych · ${monthItems.filter((x) => x.type === 'plan').length} zaplanowanych` })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Następny miesiąc', text: '›', onclick: () => shift(1) })),
    chips, grid,
    h('div', { class: 'cal-legend' }, PF_ORDER.map((p) => h('span', {}, h('i', { class: `d-${p}` }), PF[p])), h('span', {}, h('i', { class: 'ring' }), 'zaplanowane'),
      !inMonth(today) ? h('button', { class: 'chip-btn', type: 'button', text: 'Dziś', onclick: () => { H.month = today.slice(0, 8) + '01'; H.sel = today; loadPlan(); } }) : null),
    h('p', { class: 'sec-title', text: fmt(`${H.sel}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' }) }),
    dayList);
}
function planCard(it) {
  const time = fmt(it.at, { hour: '2-digit', minute: '2-digit' });
  if (it.type === 'pub') {
    const p = it.row;
    return h('button', { class: 'card fp compact', type: 'button', onclick: () => feedSheet(p) }, thumb(p),
      h('div', { class: 'fp-body' },
        h('div', { class: 'post-h' }, h('span', { class: `pf ${p.platform}`, text: PF[p.platform] }), h('span', { class: 'pill ok', text: 'opublikowany' }), h('span', { class: 'when', text: time })),
        h('p', { class: 'fp-cap', text: p.caption || '(bez opisu)' }), metricLine(p.metrics)));
  }
  const a = it.row, [lbl, tone] = it.type === 'pubc' ? ['Opublikowany – statystyki po pobraniu', 'ok'] : (POST_STATUS[a.status] || [a.status, '']);
  return h('button', { class: 'card fp compact plan', type: 'button', onclick: () => {
    openSheet(a.topic, h('div', { class: 'kv' },
      h('div', {}, h('span', { text: 'Platforma' }), h('b', { text: PF[a.platform] })),
      h('div', {}, h('span', { text: 'Status' }), h('b', { text: lbl })),
      h('div', {}, h('span', { text: it.type === 'plan' ? 'Termin' : 'Opublikowano' }), h('b', { text: fmt(it.at) }))),
    a.caption ? [h('h4', { text: 'Opis' }), h('p', { class: 'small', style: 'white-space:pre-wrap;margin:0', text: a.caption })] : null,
    h('div', { class: 'post-actions' },
      a.external_url ? h('a', { class: 'btn btn-ghost btn-sm', href: a.external_url, target: '_blank', rel: 'noopener', text: 'Zobacz ↗' }) : null,
      h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Otwórz w „Do publikacji”', onclick: () => { $('#sheet').close(); setView('queue'); } })));
  } },
  h('div', { class: `fp-thumb ph ${a.platform}`, 'aria-hidden': 'true', text: '🗓' }),
  h('div', { class: 'fp-body' },
    h('div', { class: 'post-h' }, h('span', { class: `pf ${a.platform}`, text: PF[a.platform] }), h('span', { class: `pill ${tone}`, text: lbl }), h('span', { class: 'when', text: time })),
    h('p', { class: 'fp-cap', text: a.topic })));
}

/* ================================================================== KONTA */
async function loadAccounts() {
  const box = $('#hubAccounts');
  if (!box.childElementCount) box.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const c = await sb();
  const [cfg, acc] = await Promise.all([
    callFn('social-connect', { action: 'config' }).then((d) => ({ d }), (e) => ({ e })),
    c.rpc('admin_social_accounts'),
  ]);
  H.cfg = cfg.d || null; H.cfgError = cfg.e || null;
  if (acc.error) { box.replaceChildren(h('div', { class: 'empty', text: /admin_social_accounts/.test(acc.error.message) ? 'Uruchom migrację v16 (brak funkcji admin_social_accounts).' : `Błąd: ${acc.error.message}` })); return; }
  H.accounts = acc.data || [];
  renderAccounts();
}
async function connect(provider, btn) {
  busy(btn, true, 'Otwieram logowanie…');
  try { const { url } = await callFn('social-connect', { action: 'start', provider }); location.href = url; }
  catch (e) { toast('err', e.message, 9000); busy(btn, false); }
}
async function disconnect(provider, btn) {
  const name = provider === 'meta' ? 'Facebook i Instagram' : 'TikTok';
  if (!confirm(`Rozłączyć ${name}? Publikacja i statystyki przestaną działać do ponownego połączenia. Pobrane posty zostaną w historii.`)) return;
  busy(btn, true, '…');
  try { await callFn('social-connect', { action: 'disconnect', provider }); toast('ok', `Rozłączono: ${name}.`); loadAccounts(); }
  catch (e) { toast('err', e.message); busy(btn, false); }
}
function accRow(a, platform) {
  if (!a?.connected) return h('div', { class: 'acc-row off' }, h('span', { class: `pf ${platform}`, text: PF[platform] }), h('span', { class: 'muted small', text: 'niepołączone' }));
  const exp = platform === 'tiktok' && a.refresh_expires_at ? `ważne do ${fmt(a.refresh_expires_at, { dateStyle: 'medium' })}` : 'token bez wygasania';
  return h('div', { class: 'acc-row' },
    a.avatar_url ? h('img', { class: 'acc-av', src: a.avatar_url, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: `acc-av ph ${platform}`, text: PF[platform][0] }),
    h('div', { class: 'acc-info' },
      h('div', {}, h('span', { class: `pf ${platform}`, text: PF[platform] }), ' ', h('b', { text: a.account_name || a.account_username || 'połączone' }), a.account_username ? h('span', { class: 'muted small', text: ` @${a.account_username}` }) : null),
      h('p', { text: `${a.followers !== null && a.followers !== undefined ? `${num(a.followers)} obserwujących · ` : ''}${exp} · pobrano ${ago(a.last_sync_at)}` }),
      a.last_error ? h('p', { class: 'note-line err', text: a.last_error }) : null));
}
function setupSteps(provider) {
  const ru = H.cfg?.redirect_uri || 'https://TWOJ_PROJECT_REF.supabase.co/functions/v1/social-connect';
  const copy = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Kopiuj adres', onclick: async () => { try { await navigator.clipboard.writeText(ru); toast('ok', 'Skopiowano.'); } catch { toast('err', 'Nie udało się skopiować.'); } } });
  const steps = provider === 'meta' ? [
    'developers.facebook.com → Moje aplikacje → Utwórz aplikację (typ: Business / „Zarządzaj wszystkim na stronie”).',
    'Dodaj produkt „Facebook Login for Business” i w ustawieniach wklej poniższy adres jako „Valid OAuth Redirect URI”.',
    'Ustawienia → Podstawowe: skopiuj App ID i App Secret.',
    'W Supabase: supabase secrets set META_APP_ID=… META_APP_SECRET=… CENTRUM_URL=https://adres-centrum',
    'Wróć tutaj i kliknij „Połącz Facebook + Instagram”. Zaznacz stronę Strike Tech Lab i konto Instagram.',
  ] : [
    'developers.tiktok.com → Manage apps → Connect an app (Strike Tech Lab).',
    'Dodaj produkty „Login Kit” i „Content Posting API”; w Login Kit wklej poniższy adres jako Redirect URI (Web).',
    'Zaznacz zakresy: user.info.basic, user.info.profile, user.info.stats, video.list, video.upload.',
    'W Supabase: supabase secrets set TIKTOK_CLIENT_KEY=… TIKTOK_CLIENT_SECRET=…',
    'Dopóki aplikacja jest w trybie Sandbox, dodaj swoje konto TikTok jako „target user”. Potem kliknij „Połącz TikTok”.',
  ];
  return h('details', { class: 'more setup', open: !H.cfg?.[provider]?.configured },
    h('summary', { text: H.cfg?.[provider]?.configured ? 'Instrukcja konfiguracji' : 'Najpierw skonfiguruj aplikację (jednorazowo, ok. 15 min)' }),
    h('ol', { class: 'steps' }, steps.map((s) => h('li', { text: s }))),
    h('div', { class: 'redirect' }, h('code', { text: ru }), copy));
}
function renderAccounts() {
  const box = $('#hubAccounts');
  const by = Object.fromEntries(H.accounts.map((a) => [a.platform, a]));
  const metaOn = by.facebook?.connected || by.instagram?.connected, ttOn = by.tiktok?.connected;
  const cfgMissing = H.cfgError ? h('div', { class: 'card note-card' }, h('b', { text: 'Funkcja social-connect jest niedostępna' }),
    h('p', { text: `${H.cfgError.message} Wdróż ją: supabase functions deploy social-connect --no-verify-jwt (instrukcja w README_SOCIAL_HUB.md).` })) : null;
  const card = (provider, title, sub, rows, on) => {
    const configured = H.cfg?.[provider]?.configured;
    return h('div', { class: 'card acc hud' },
      h('div', { class: 'acc-h' }, h('div', {}, h('b', { text: title }), h('p', { text: sub })), h('span', { class: `pill ${on ? 'ok' : 'ghost'}`, text: on ? 'połączone' : 'niepołączone' })),
      rows,
      h('div', { class: 'post-actions' },
        h('button', { class: `btn ${on ? 'btn-ghost' : 'btn-gold'} btn-sm`, type: 'button', disabled: !configured, title: configured ? null : 'Najpierw skonfiguruj aplikację', text: on ? 'Połącz ponownie' : `Połącz ${provider === 'meta' ? 'Facebook + Instagram' : 'TikTok'}`, onclick: (e) => connect(provider, e.currentTarget) }),
        on ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '↻ Pobierz posty', onclick: (e) => runSync(e.currentTarget, provider === 'meta' ? ['facebook', 'instagram'] : ['tiktok']) }) : null,
        on ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Rozłącz', onclick: (e) => disconnect(provider, e.currentTarget) }) : null),
      setupSteps(provider));
  };
  put(box, 
    cfgMissing,
    card('meta', 'Meta – Facebook + Instagram', 'Jedno logowanie łączy stronę na Facebooku i firmowe konto Instagram (musi być połączone ze stroną).',
      [accRow(by.facebook, 'facebook'), accRow(by.instagram, 'instagram')], metaOn),
    card('tiktok', 'TikTok', `Publikacja filmów (${H.cfg?.tiktok?.mode === 'direct' ? 'od razu' : 'jako szkic w aplikacji'}) i statystyki wszystkich filmów z konta.`,
      [accRow(by.tiktok, 'tiktok')], ttOn),
    h('div', { class: 'card note-card' }, h('b', { text: 'Jak to działa' }),
      h('p', { text: 'Tokeny są zapisane tylko na serwerze – przeglądarka ich nie widzi. Statystyki pobierają się same co 3 godziny (zadanie stl-social-statystyki), a przyciskiem „Pobierz” od razu. Najwygodniej łączyć konta w przeglądarce na komputerze.' })),
    h('p', { class: 'free-note', text: 'YouTube Shorts i X można dodać w kolejnym kroku, gdy zaczniesz tam publikować.' }));
}

/* ================================================================== start */
function handleReturn() {
  const qs = new URLSearchParams(location.search);
  const hub = qs.get('hub'), ok = qs.get('connected'), err = qs.get('social_error'), note = qs.get('note');
  if (!hub && !ok && !err) return null;
  if (ok) {
    toast('ok', ok === 'meta' ? 'Połączono Facebook i Instagram.' : 'Połączono TikTok.', 7000);
    if (note) toast('info', note, 12000);
  }
  if (err) toast('err', `Połączenie nieudane: ${err}`, 14000);
  ['hub', 'connected', 'social_error', 'note'].forEach((k) => qs.delete(k));
  history.replaceState(null, '', `${location.pathname}${qs.toString() ? `?${qs}` : ''}`);
  return { hub, ok };
}
function boot() {
  const tabs = $('#hubTabs'); if (!tabs) return;
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-hub]'); if (!b) return; vibrate(); setView(b.dataset.hub); });
  // odświeżanie (przycisk ↻ w nagłówku zakładki Social)
  $('[data-refresh="social"]')?.addEventListener('click', () => { if (H.view !== 'queue') { H.loaded.delete(H.view); setView(H.view); } });
  // gdy zakładka Social staje się widoczna – doładuj bieżący widok
  const sec = $('section[data-view="social"]');
  new MutationObserver(() => { if (!sec.hidden && H.view !== 'queue' && !H.loaded.has(H.view)) { H.loaded.add(H.view); reload(); } })
    .observe(sec, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && socialVisible() && H.view !== 'queue') reload(); });

  const ret = handleReturn();
  let start = 'queue';
  try { start = JSON.parse(localStorage.getItem('stl_hub_view')) || 'queue'; } catch { /* */ }
  setView(ret?.hub || start, { load: false });
  if (socialVisible() && H.view !== 'queue') { H.loaded.add(H.view); reload(); }
  // po świeżym połączeniu od razu pobierz posty i statystyki (gdy użytkownik jest już zalogowany)
  if (ret?.ok) {
    const go = () => runSync(null, ret.ok === 'meta' ? ['facebook', 'instagram'] : ['tiktok']);
    if (token()) setTimeout(go, 1500);
    else { const t = setInterval(() => { if (token()) { clearInterval(t); setTimeout(go, 1500); } }, 1000); setTimeout(() => clearInterval(t), 120000); }
  }
}
boot();
