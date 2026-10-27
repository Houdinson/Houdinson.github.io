/* =====================================================================
   STL Centrum Dowodzenia – aplikacja PWA dla administratora.
   Korzysta z istniejącego backendu strony (Supabase + funkcja "admin") oraz nowych
   funkcji: admin-finance, ai-social-agent, publish-post (migracja v4).
   Wszystkie teksty z bazy wstawiane są przez textContent (bez innerHTML).
   ===================================================================== */
const CFG = window.STL_CENTRUM || {};
const TZ = 'Europe/Warsaw';

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
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const zl = (g) => g === null || g === undefined ? '–' : (g / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: g % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fmt = (iso, o = { dateStyle: 'medium', timeStyle: 'short' }) => iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TZ, ...o }) : '–';
const hm = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
const dayKeyOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const todayKey = () => dayKeyOf(new Date());
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const wday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'przed chwilą'; if (s < 3600) return `${Math.round(s / 60)} min temu`; if (s < 86400) return `${Math.round(s / 3600)} h temu`; return fmt(iso, { day: 'numeric', month: 'short' }); };
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* prywatny */ } } };

function toast(kind, text, ms = 5000) {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, h('span', { text }), h('button', { 'aria-label': 'Zamknij', text: '×', onclick: () => t.remove() }));
  $('#toasts').append(t); if (ms) setTimeout(() => t.remove(), ms);
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), ' ', label || 'Chwileczkę…'); }
  else { btn.disabled = false; btn.textContent = label || btn.dataset.label || ''; }
}
function vibrate(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* */ } }

/* ------------------------------------------------------------------ stan */
let sb = null, session = null;
const S = {
  tab: 'today',
  orders: [], ordFilter: 'active', ordQ: '',
  cal: { day: todayKey(), slots: [], ordersById: new Map(), from: null },
  posts: [], socFilter: 'review', lastRun: null,
  fin: null, loaded: new Set(),
};
const STATUS = {
  OCZEKUJE_NA_PLATNOSC: ['Czeka na płatność', 'wait'], OPLACONE: ['Opłacone – nowe', 'info'], W_REALIZACJI: ['W realizacji', 'ok'],
  TESTY: ['Testy i raport', 'ok'], ZAKONCZONE: ['Zakończone', 'ghost'], ANULOWANE: ['Anulowane', 'bad'],
};
const ADMIN_STATUSES = ['W_REALIZACJI', 'TESTY', 'ZAKONCZONE', 'ANULOWANE'];
const ORD_FILTERS = {
  active: ['Aktywne', ['OPLACONE', 'W_REALIZACJI', 'TESTY']], pending: ['Czeka na płatność', ['OCZEKUJE_NA_PLATNOSC']],
  done: ['Zakończone', ['ZAKONCZONE']], cancelled: ['Anulowane', ['ANULOWANE']], all: ['Wszystkie', null],
};
const POST_STATUS = {
  DO_AKCEPTACJI: ['Do akceptacji', 'wait'], ZATWIERDZONY: ['Zatwierdzony', 'info'], PUBLIKACJA: ['Publikuję…', 'info'],
  W_APLIKACJI: ['W aplikacji TikTok', 'ok'], OPUBLIKOWANY: ['Opublikowany', 'ok'], ODRZUCONY: ['Odrzucony', 'ghost'], BLAD: ['Błąd publikacji', 'bad'],
};
const SOC_FILTERS = {
  review: ['Do akceptacji', ['DO_AKCEPTACJI']], approved: ['Zatwierdzone', ['ZATWIERDZONY', 'PUBLIKACJA']],
  published: ['Opublikowane', ['OPUBLIKOWANY', 'W_APLIKACJI']], problems: ['Odrzucone i błędy', ['BLAD', 'ODRZUCONY']],
};
const PF = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };
const FORMAT = { short: 'Short', reel: 'Reels', post: 'Post' };
const POST_ERR = { MEDIA_REQUIRED: 'TikTok i Instagram wymagają filmu – dodaj plik przed zatwierdzeniem.', ONLY_SERVER_PUBLISHES: 'Publikację wykonuje serwer – użyj przycisku „Publikuj teraz”.', POST_ALREADY_PUBLISHED: 'Opublikowanego posta nie można edytować.', STATUS_TRANSITION_NOT_ALLOWED: 'Tej zmiany statusu nie można wykonać.' };
const postErr = (e) => { const k = Object.keys(POST_ERR).find((x) => String(e?.message || '').includes(x)); return k ? POST_ERR[k] : (e?.message || 'Błąd zapisu.'); };

/* ------------------------------------------------------------------ backend */
async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let p = {}; try { p = await error.context.json(); } catch { /* */ }
    const offline = error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError';
    throw Object.assign(new Error(p.error || (offline ? 'Brak połączenia z serwerem.' : 'Błąd serwera. Spróbuj ponownie.')), { code: p.code });
  }
  return data;
}

const conn = { timer: null };
function setConn(state) {
  const map = { ok: ['ok', 'Online'], wait: ['wait', 'Łączenie'], bad: ['bad', 'Offline'] }[state];
  $('#conn .dot').className = `dot ${map[0]}`; $('#connTxt').textContent = map[1];
  $('#offline').classList.toggle('hidden', state !== 'bad');
}
async function heartbeat() {
  clearTimeout(conn.timer);
  if (!navigator.onLine) { setConn('bad'); conn.timer = setTimeout(heartbeat, 10000); return; }
  const { error } = await sb.from('profiles').select('id', { head: true, count: 'exact' }).limit(1).then((r) => r, (e) => ({ error: e }));
  setConn(error ? 'bad' : 'ok');
  conn.timer = setTimeout(heartbeat, error ? 8000 : 45000);
}
addEventListener('online', () => { heartbeat(); reloadActive(); });
addEventListener('offline', () => setConn('bad'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session) { heartbeat(); reloadActive(); refreshBadges(); } });

/* ------------------------------------------------------------------ logowanie */
function showLoginStep(step) {
  $('#login').classList.remove('hidden'); $('#app').classList.add('hidden');
  $('#loginForm').classList.toggle('hidden', step !== 'password');
  $('#mfaForm').classList.toggle('hidden', step !== 'mfa');
  setTimeout(() => (step === 'mfa' ? $('#mCode') : $('#lMail')).focus(), 50);
}
async function showLoginOrApp() {
  if (!session) { showLoginStep('password'); return; }
  const { data: p } = await sb.from('profiles').select('is_admin,full_name').eq('id', session.user.id).maybeSingle();
  if (!p?.is_admin) {
    await sb.auth.signOut();
    $('#lMsg').className = 'form-msg err'; $('#lMsg').textContent = 'To konto nie ma uprawnień administratora.';
    return;
  }
  // O tym, czy potrzebny jest kod 2FA, decyduje baza (funkcja is_admin) – Centrum tylko się dostosowuje
  const { data: dbAdmin } = await sb.rpc('is_admin');
  if (!dbAdmin) {
    const { data: f } = await sb.auth.mfa.listFactors();
    if (!f?.totp?.some((x) => x.status === 'verified')) {
      await sb.auth.signOut();
      $('#lMsg').className = 'form-msg err';
      $('#lMsg').textContent = 'Najpierw włącz logowanie dwuetapowe (2FA) na stronie: Strefa Klienta → Administracja. Potem zaloguj się tutaj.';
      return;
    }
    showLoginStep('mfa'); return;
  }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  const want = new URLSearchParams(location.search).get('tab');
  openTab(TABS.includes(want) ? want : 'today');
  heartbeat(); subscribe(); refreshBadges();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lBtn'), msg = $('#lMsg'); msg.className = 'form-msg'; msg.textContent = '';
  busy(btn, true, 'Loguję…');
  const { error } = await sb.auth.signInWithPassword({ email: $('#lMail').value.trim(), password: $('#lPass').value });
  busy(btn, false, 'Zaloguj');
  if (error) { msg.className = 'form-msg err'; msg.textContent = /Invalid login/i.test(error.message) ? 'Nieprawidłowy e-mail lub hasło.' : error.message; }
});
$('#mfaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#mCode').value.replace(/\D/g, ''), btn = $('#mBtn'), msg = $('#mMsg');
  msg.className = 'form-msg'; msg.textContent = '';
  if (code.length !== 6) { msg.className = 'form-msg err'; msg.textContent = 'Kod ma 6 cyfr.'; return; }
  busy(btn, true, 'Sprawdzam…');
  const { data: f } = await sb.auth.mfa.listFactors();
  const factor = f?.totp?.find((x) => x.status === 'verified');
  const { error } = factor ? await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code }) : { error: new Error('Brak skonfigurowanego 2FA.') };
  busy(btn, false, 'Potwierdź');
  if (error) { msg.className = 'form-msg err'; msg.textContent = /invalid|expired/i.test(error.message) ? 'Nieprawidłowy lub wygasły kod. Spróbuj z nowym.' : error.message; $('#mCode').select(); return; }
  $('#mCode').value = '';
  const { data } = await sb.auth.getSession(); session = data.session; S.loaded.clear(); showLoginOrApp();
});
$('#mBack').addEventListener('click', () => sb.auth.signOut());
$('#logoutBtn').addEventListener('click', async () => { if (confirm('Wylogować z Centrum?')) await sb.auth.signOut(); });

/* ------------------------------------------------------------------ zakładki */
const TABS = ['today', 'orders', 'calendar', 'social', 'finance'];
function openTab(tab) {
  S.tab = tab; store.set('stl_tab', tab);
  $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== tab; });
  $$('.tabbar button').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  scrollTo({ top: 0 });
  if (!S.loaded.has(tab)) { S.loaded.add(tab); reloadActive(); }
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => { vibrate(); openTab(b.dataset.tab); }));
$$('[data-refresh]').forEach((b) => b.addEventListener('click', () => { vibrate(); reloadActive(); }));
function reloadActive() {
  if (!session) return;
  ({ today: loadToday, orders: loadOrders, calendar: loadCalendar, social: loadSocial, finance: loadFinance })[S.tab]?.();
}

/* ------------------------------------------------------------------ arkusz (bottom sheet) */
const sheet = $('#sheet');
function openSheet(title, ...content) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').replaceChildren(...content.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

/* ================================================================== ZLECENIA */
const ORD_COLS = 'id,order_number,status,service_id,config,service_name,express,total_grosze,amount_due_grosze,created_at,paid_at,customer,slot_conflict,user_id,handover,city,customer_note,spec,discount_code,referral_code_used,profiles(email,full_name,phone),calendar_slots(starts_at,ends_at,status,hold_expires_at),order_events(status,note,at),order_results(phase,metrics)';
async function loadOrders() {
  const box = $('#ordList'); if (!S.orders.length) box.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const { data, error } = await sb.from('orders').select(ORD_COLS).order('created_at', { ascending: false }).limit(500);
  if (error) { box.replaceChildren(h('div', { class: 'empty', text: `Błąd: ${error.message}` })); return; }
  S.orders = data; renderOrders();
}
function renderOrders() {
  const today = todayKey();
  const active = S.orders.filter((o) => ORD_FILTERS.active[1].includes(o.status));
  const todaySlots = S.orders.filter((o) => o.status !== 'ANULOWANE' && o.calendar_slots?.some((s) => s.status === 'ZAKONCZONA_REZERWACJA' && dayKeyOf(new Date(s.starts_at)) === today));
  $('#ordKpi').replaceChildren(
    h('div', { class: 'kpi' }, h('b', { text: String(active.length) }), h('span', { text: 'aktywne' })),
    h('div', { class: 'kpi' }, h('b', { text: String(todaySlots.length) }), h('span', { text: 'terminy dziś' })),
    h('div', { class: 'kpi' }, h('b', { text: String(S.orders.filter((o) => o.status === 'OPLACONE').length) }), h('span', { text: 'nowe do przyjęcia' })));
  $('#ordChips').replaceChildren(...Object.entries(ORD_FILTERS).map(([k, [label, st]]) => h('button', {
    class: 'chip', role: 'tab', type: 'button', 'aria-selected': String(k === S.ordFilter), onclick: () => { S.ordFilter = k; renderOrders(); },
  }, label, h('span', { class: 'n', text: String(st ? S.orders.filter((o) => st.includes(o.status)).length : S.orders.length) }))));
  const st = ORD_FILTERS[S.ordFilter][1], q = S.ordQ;
  const list = S.orders.filter((o) => (!st || st.includes(o.status)) && (!q || [o.order_number, o.service_name, o.profiles?.full_name, o.profiles?.email, o.customer?.name, o.customer?.company, o.customer?.phone].join(' ').toLowerCase().includes(q)));
  const box = $('#ordList');
  if (!list.length) { box.replaceChildren(h('div', { class: 'empty', text: 'Brak zleceń w tym widoku.' })); return; }
  box.replaceChildren(...list.map((o) => {
    const slot = o.calendar_slots?.[0], [lbl, tone] = STATUS[o.status] || [o.status, ''];
    const card = h('button', { class: 'card ord', type: 'button', onclick: () => { if (card._swiped) { card._swiped = false; return; } orderSheet(o.id); } },
      h('div', { class: 'ord-h' }, h('span', { class: 'ord-num', text: o.order_number || 'bez numeru' }), h('span', { class: `pill ${tone}`, text: lbl })),
      h('h4', { text: o.service_name + (o.express ? ' + Express' : '') }),
      h('div', { class: 'ord-meta' },
        h('span', {}, h('b', { text: o.customer?.name || o.profiles?.full_name || 'Klient' })),
        h('span', { text: slot ? `${fmt(slot.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })} ${hm(slot.starts_at)}` : 'bez terminu' }),
        h('span', { text: o.amount_due_grosze < o.total_grosze ? `${zl(o.amount_due_grosze)} / ${zl(o.total_grosze)}` : zl(o.total_grosze) }),
        o.slot_conflict ? h('span', { class: 'flag', text: '⚠ konflikt terminu' }) : null));
    return swipeable(card, o);
  }));
}
$('#ordSearch').addEventListener('input', debounce((e) => { S.ordQ = e.target.value.trim().toLowerCase(); renderOrders(); }, 200));

function orderSheet(id) {
  const o = S.orders.find((x) => x.id === id); if (!o) return;
  const c = o.customer || {}, slot = o.calendar_slots?.[0];
  const phone = c.phone || o.profiles?.phone, email = o.profiles?.email || c.email;
  const status = h('select', { class: 'select', 'aria-label': 'Nowy status' }, ADMIN_STATUSES.map((k) => h('option', { value: k, text: STATUS[k][0], selected: k === o.status })));
  const note = h('input', { class: 'input', maxlength: 500, placeholder: 'Notatka dla klienta (opcjonalnie)' });
  const files = h('div', { class: 'files' }, h('span', { class: 'muted small', text: 'Ładuję pliki…' }));
  const thumbs = h('div', { class: 'thumbs' });
  const fileIn = h('input', { class: 'input', type: 'file', accept: 'application/pdf,.pdf,image/png,image/jpeg' });
  const act = async (btn, label, body, ok) => { busy(btn, true); try { const d = await callFn('admin', body); toast('ok', ok(d)); vibrate(20); sheet.close(); await loadOrders(); } catch (e) { toast('err', e.message); busy(btn, false, label); } };
  const changeBtn = h('button', { class: 'btn btn-gold btn-block', type: 'button', text: 'Zmień status', onclick: (e) => {
    if (status.value === 'ANULOWANE' && !confirm('Anulować zlecenie? Zwrot płatności wykonujesz w panelu Stripe.')) return;
    act(e.currentTarget, 'Zmień status', { action: 'set_status', order_id: o.id, status: status.value, note: note.value.trim() }, () => 'Status zmieniony – klient widzi go od razu.');
  } });
  openSheet(`${o.order_number || 'Zlecenie'} · ${o.service_name}`,
    h('div', { class: 'kv' },
      h('div', {}, h('span', { text: 'Status' }), h('b', { text: STATUS[o.status]?.[0] || o.status })),
      h('div', {}, h('span', { text: 'Klient' }), h('b', { text: c.name || o.profiles?.full_name || '–' })),
      c.type === 'business' ? h('div', {}, h('span', { text: 'Firma' }), h('b', { text: `${c.company || ''} · NIP ${c.nip || ''}` })) : null,
      h('div', {}, h('span', { text: 'Termin' }), h('b', { text: slot ? `${fmt(slot.starts_at, { weekday: 'long', day: 'numeric', month: 'long' })}, ${hm(slot.starts_at)}–${hm(slot.ends_at)}` : '–' })),
      h('div', {}, h('span', { text: 'Kwota' }), h('b', { text: o.amount_due_grosze < o.total_grosze ? `${zl(o.amount_due_grosze)} wpłacone z ${zl(o.total_grosze)}` : zl(o.total_grosze) })),
      o.handover ? h('div', {}, h('span', { text: 'Przekazanie' }), h('b', { text: `${o.handover === 'courier' ? 'Kurier' : 'Osobiście'}${o.city ? ', ' + o.city : ''}` })) : null,
      o.discount_code || o.referral_code_used ? h('div', {}, h('span', { text: 'Kod' }), h('b', { text: o.discount_code || o.referral_code_used })) : null),
    h('div', { class: 'post-actions' },
      phone ? h('a', { class: 'btn btn-ghost btn-sm', href: `tel:${String(phone).replace(/\s/g, '')}`, text: '📞 Zadzwoń' }) : null,
      email ? h('a', { class: 'btn btn-ghost btn-sm', href: `mailto:${email}?subject=${encodeURIComponent(`${o.order_number || 'Zlecenie'} – Strike Tech Lab`)}`, text: '✉ E-mail' }) : null,
      phone || email ? h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '💬 Wiadomość z szablonu', onclick: () => messageSheet(o) }) : null),
    o.customer_note ? [h('h4', { text: 'Uwagi klienta' }), h('p', { class: 'small', style: 'white-space:pre-wrap;margin:0', text: o.customer_note })] : null,
    Object.keys(o.spec || {}).length ? [h('h4', { text: 'Specyfikacja' }), h('div', { class: 'kv' }, Object.entries(o.spec).map(([k, v]) => h('div', {}, h('span', { text: k }), h('b', { text: String(v) }))))] : null,
    o.order_number ? [h('h4', { text: 'Zmiana statusu' }), h('label', { class: 'field' }, status), h('label', { class: 'field' }, note), changeBtn] : null,
    !o.order_number && o.status === 'OCZEKUJE_NA_PLATNOSC' ? [h('h4', { text: 'Płatność' }),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Oznacz jako opłacone (gotówka / przelew)', onclick: (e) => { if (confirm('Potwierdzasz wpłatę poza Stripe?')) act(e.currentTarget, 'Oznacz jako opłacone (gotówka / przelew)', { action: 'mark_paid', order_id: o.id }, (d) => `Opłacone: ${d.order_number || ''}`); } })] : null,
    o.user_id && o.order_number ? [h('h4', { text: 'Raport STRIKE PROOF' }),
      h('button', { class: 'btn btn-gold btn-block', type: 'button', text: '📊 Wpisz pomiary i utwórz raport PDF', onclick: () => reportSheet(o) })] : null,
    o.user_id ? [h('h4', { text: 'Zdjęcia przy przyjęciu' }), photoTools(o, thumbs)] : null,
    o.user_id ? [h('h4', { text: 'Pliki klienta' }), files,
      h('div', { class: 'row2', style: 'margin-top:10px;grid-template-columns:1fr auto' }, fileIn,
        h('button', { class: 'btn btn-gold', type: 'button', text: 'Wgraj', onclick: (e) => uploadReport(o, fileIn, files, e.currentTarget) }))] : null,
    o.order_events?.length ? [h('h4', { text: 'Historia' }), h('ul', { class: 'timeline' }, [...o.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((ev) => h('li', {}, h('time', { text: fmt(ev.at) }), (STATUS[ev.status]?.[0] || ev.status) + (ev.note ? ` – ${ev.note}` : ''))))] : null);
  if (o.user_id) loadReportFiles(o, files, thumbs);
}
async function loadReportFiles(o, box, thumbs) {
  const folder = `${o.user_id}/${o.id}`;
  const { data, error } = await sb.storage.from('reports').list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
  if (error) { box.replaceChildren(h('span', { class: 'muted small', text: error.message })); return; }
  const all = (data || []).filter((f) => f.name && f.id && !f.name.startsWith('.'));
  const photos = thumbs ? all.filter((f) => /Przyjecie/i.test(f.name) && /\.(jpe?g|png)$/i.test(f.name)) : [];
  const list = all.filter((f) => !photos.includes(f));
  if (thumbs) renderThumbs(folder, photos, thumbs);
  box.replaceChildren(...(list.length ? list.map((f) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: `⬇ ${f.name.replace(/^\d{10,}-/, '')}`, onclick: async () => {
    const { data: s, error: err } = await sb.storage.from('reports').createSignedUrl(`${folder}/${f.name}`, 120);
    if (err) return toast('err', 'Nie udało się otworzyć pliku.'); window.open(s.signedUrl, '_blank', 'noopener');
  } })) : [h('span', { class: 'muted small', text: 'Brak plików. Raport PDF utworzysz przyciskiem powyżej albo wgrasz gotowy plik.' })]));
}
async function uploadReport(o, input, box, btn) {
  const f = input.files[0]; if (!f) return toast('err', 'Wybierz plik.');
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const mime = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
  if (!mime) return toast('err', 'Dozwolone: PDF, PNG, JPG.');
  if (f.size > 10 * 1024 * 1024) return toast('err', 'Plik większy niż 10 MB.');
  busy(btn, true, '…');
  const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(-90);
  const { error } = await sb.storage.from('reports').upload(`${o.user_id}/${o.id}/${Date.now()}-${safe}`, f, { contentType: mime, upsert: false });
  busy(btn, false, 'Wgraj');
  if (error) return toast('err', `Nie udało się wgrać: ${error.message}`);
  input.value = ''; toast('ok', 'Raport wgrany – klient może go pobrać.'); vibrate(20); loadReportFiles(o, box);
}

/* ================================================================== KALENDARZ */
const DAYS_AHEAD = 28;
const SLOT_LBL = { TRZYMANA: ['Czeka na płatność', 'wait'], ZAKONCZONA_REZERWACJA: ['Potwierdzony', 'ok'], ZABLOKOWANA: ['Blokada', 'bad'] };
async function loadCalendar() {
  const start = todayKey(), end = addDays(start, DAYS_AHEAD + 1);
  const { data, error } = await sb.from('calendar_slots').select('id,starts_at,ends_at,status,hold_expires_at,order_id')
    .gte('starts_at', `${addDays(start, -1)}T00:00:00Z`).lt('starts_at', `${end}T00:00:00Z`)
    .in('status', ['TRZYMANA', 'ZAKONCZONA_REZERWACJA', 'ZABLOKOWANA']).order('starts_at');
  if (error) { $('#calList').replaceChildren(h('div', { class: 'empty', text: `Błąd: ${error.message}` })); return; }
  S.cal.slots = data.filter((s) => s.status !== 'TRZYMANA' || new Date(s.hold_expires_at) > new Date());
  const ids = [...new Set(S.cal.slots.map((s) => s.order_id).filter(Boolean))];
  S.cal.ordersById = new Map();
  if (ids.length) {
    const { data: os } = await sb.from('orders').select('id,order_number,service_name,status,customer,profiles(full_name,phone)').in('id', ids);
    for (const o of os || []) S.cal.ordersById.set(o.id, o);
  }
  renderCalendar();
}
function renderCalendar() {
  const start = todayKey(), names = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  const byDay = new Map();
  for (const s of S.cal.slots) { const k = dayKeyOf(new Date(s.starts_at)); (byDay.get(k) || byDay.set(k, []).get(k)).push(s); }
  $('#calDays').replaceChildren(...Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const key = addDays(start, i), w = wday(key), items = byDay.get(key) || [];
    return h('button', { type: 'button', class: `day${w === 0 ? ' sun' : ''}${items.some((s) => s.status === 'ZABLOKOWANA') ? ' blocked' : ''}`, 'aria-pressed': String(key === S.cal.day),
      onclick: () => { S.cal.day = key; renderCalendar(); } },
      h('small', { text: i === 0 ? 'dziś' : names[w] }), h('b', { text: String(+key.slice(8)) }), items.length ? h('i') : null);
  }));
  $('#calDays [aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const items = byDay.get(S.cal.day) || [];
  const box = $('#calList');
  const head = h('p', { class: 'free-note', text: `${fmt(`${S.cal.day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}${wday(S.cal.day) === 0 ? ' · niedziela (nieczynne)' : ' · godziny 10:00–20:00'}` });
  if (!items.length) { box.replaceChildren(head, h('div', { class: 'empty', text: 'Brak rezerwacji i blokad – cały dzień wolny.' })); return; }
  box.replaceChildren(head, ...items.map((s) => {
    const o = S.cal.ordersById.get(s.order_id), [lbl, tone] = SLOT_LBL[s.status] || [s.status, ''];
    return h('div', { class: `card slot ${s.status}` },
      h('time', { text: hm(s.starts_at) }, h('span', { text: hm(s.ends_at) })),
      h('div', {},
        h('h4', { text: o ? o.service_name : s.status === 'ZABLOKOWANA' ? 'Blokada terminu' : 'Rezerwacja' }),
        h('p', { text: o ? `${o.order_number || 'czeka na płatność'} · ${o.customer?.name || o.profiles?.full_name || ''}` : s.status === 'TRZYMANA' ? `wygasa ${hm(s.hold_expires_at)}` : 'niedostępne dla klientów' }),
        h('span', { class: `pill ${tone}`, text: lbl })),
      s.status === 'ZABLOKOWANA' && !s.order_id ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zdejmij', onclick: (e) => unblock(s, e.currentTarget) })
        : o ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Szczegóły zlecenia', text: '›', onclick: async () => { if (!S.orders.length) await loadOrders(); orderSheet(o.id); } }) : h('span'));
  }));
}
async function unblock(s, btn) {
  if (!confirm(`Zdjąć blokadę ${hm(s.starts_at)}–${hm(s.ends_at)}?`)) return;
  busy(btn, true, '…');
  const { data, error } = await sb.rpc('admin_unblock', { p_slot_id: s.id });
  if (error || !data) { busy(btn, false, 'Zdejmij'); return toast('err', error?.message || 'Nie udało się zdjąć blokady.'); }
  toast('ok', 'Blokada zdjęta – termin wrócił do kalendarza.'); loadCalendar();
}
async function blockDay(date, from, to, reason) { return callFn('admin', { action: 'block', date, from, to, reason }); }

$('#blockDayBtn').addEventListener('click', async (e) => {
  if (wday(S.cal.day) === 0) return toast('info', 'W niedzielę i tak nie ma rezerwacji.');
  if (!confirm(`Zablokować cały dzień ${fmt(`${S.cal.day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}?`)) return;
  const b = e.currentTarget; busy(b, true);
  try { await blockDay(S.cal.day, '10:00', '20:00', 'Dzień zablokowany'); toast('ok', 'Dzień zablokowany.'); vibrate(20); loadCalendar(); }
  catch (err) { toast('err', err.message); }
  busy(b, false, 'Zablokuj ten dzień');
});
$('#blockHoursBtn').addEventListener('click', () => {
  const date = h('input', { class: 'input', type: 'date', min: todayKey(), value: S.cal.day });
  const from = h('input', { class: 'input', type: 'time', step: 3600, value: '10:00' }), to = h('input', { class: 'input', type: 'time', step: 3600, value: '14:00' });
  const why = h('input', { class: 'input', maxlength: 100, placeholder: 'Powód (np. dostawa części)' });
  openSheet('Blokada godzin', h('label', { class: 'field' }, h('span', { text: 'Dzień' }), date),
    h('div', { class: 'row2' }, h('label', { class: 'field' }, h('span', { text: 'Od' }), from), h('label', { class: 'field' }, h('span', { text: 'Do' }), to)),
    h('label', { class: 'field' }, h('span', { text: 'Powód' }), why),
    h('button', { class: 'btn btn-gold btn-block', type: 'button', text: 'Zablokuj', onclick: async (e) => {
      if (!date.value || from.value >= to.value) return toast('err', 'Sprawdź dzień i godziny.');
      const b = e.currentTarget; busy(b, true);
      try { await blockDay(date.value, from.value, to.value, why.value.trim()); toast('ok', 'Godziny zablokowane.'); sheet.close(); S.cal.day = date.value; loadCalendar(); }
      catch (err) { toast('err', err.message); busy(b, false, 'Zablokuj'); }
    } }));
});
$('#vacationBtn').addEventListener('click', () => {
  const d1 = h('input', { class: 'input', type: 'date', min: todayKey(), value: S.cal.day }), d2 = h('input', { class: 'input', type: 'date', min: todayKey(), value: addDays(S.cal.day, 6) });
  const why = h('input', { class: 'input', maxlength: 100, value: 'Urlop' });
  const out = h('div', { class: 'small', style: 'margin-top:12px' });
  openSheet('Szybka blokada urlopowa', h('p', { class: 'muted small', style: 'margin-top:0', text: 'Blokuje dni pn–sb (10:00–20:00). Dni z opłaconymi rezerwacjami zostaną pominięte – zobaczysz je na liście.' }),
    h('div', { class: 'row2' }, h('label', { class: 'field' }, h('span', { text: 'Od' }), d1), h('label', { class: 'field' }, h('span', { text: 'Do' }), d2)),
    h('label', { class: 'field' }, h('span', { text: 'Powód' }), why),
    h('button', { class: 'btn btn-gold btn-block', type: 'button', text: 'Zablokuj urlop', onclick: async (e) => {
      if (!d1.value || !d2.value || d2.value < d1.value) return toast('err', 'Sprawdź daty.');
      const days = []; for (let k = d1.value; k <= d2.value && days.length < 62; k = addDays(k, 1)) if (wday(k) !== 0) days.push(k);
      const b = e.currentTarget; busy(b, true, `0 / ${days.length}`);
      const failed = [];
      for (let i = 0; i < days.length; i++) {
        try { await blockDay(days[i], '10:00', '20:00', why.value.trim() || 'Urlop'); }
        catch (err) { failed.push(`${fmt(`${days[i]}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short' })}: ${err.message}`); }
        b.lastChild.textContent = ` ${i + 1} / ${days.length}`;
      }
      busy(b, false, 'Zablokuj urlop');
      out.replaceChildren(h('p', { class: failed.length ? '' : 'gold', text: `Zablokowano ${days.length - failed.length} z ${days.length} dni.` }), ...failed.map((t) => h('p', { class: 'note-line err', text: t })));
      if (!failed.length) { toast('ok', 'Urlop zablokowany.'); vibrate(30); setTimeout(() => sheet.close(), 900); }
      loadCalendar();
    } }), out);
});

/* ================================================================== SOCIAL MEDIA */
async function loadSocial() {
  const box = $('#socList'); if (!S.posts.length) box.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const [p, r] = await Promise.all([
    sb.from('ai_posts').select('*').order('created_at', { ascending: false }).limit(150),
    sb.from('ai_agent_runs').select('id,status,posts_created,error,started_at,finished_at,trigger').order('started_at', { ascending: false }).limit(1),
  ]);
  if (p.error) { box.replaceChildren(h('div', { class: 'empty', text: /ai_posts/.test(p.error.message) ? 'Uruchom migrację v4 (tabela ai_posts nie istnieje).' : `Błąd: ${p.error.message}` })); return; }
  S.posts = p.data; S.lastRun = r.data?.[0] || null;
  renderSocial();
}
/* Propozycje bez płatnego API: piszesz je z Claude w czacie (plan Pro), a tutaj wklejasz wynik.
   Automatyczny agent (ai-social-agent) pokazuje się tylko, jeśli kiedyś był użyty z kluczem API. */
function renderRunBar() {
  const r = S.lastRun, apiUsed = r?.status === 'OK';
  const paste = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Wklej z czatu', onclick: pasteSheet });
  const gen = apiUsed ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Generuj (API)', onclick: async (e) => {
    const b = e.currentTarget; busy(b, true, 'Start…');
    try { const d = await callFn('ai-social-agent', {}); toast('info', d.message, 8000); } catch (err) { toast('err', err.message); }
    busy(b, false, 'Generuj (API)');
  } }) : null;
  $('#runBar').replaceChildren(h('div', {},
    h('b', { text: 'Nowe propozycje' }),
    h('p', { text: 'Napisz w czacie Claude: „przygotuj posty dla Strike Tech Lab do Centrum” i wklej odpowiedź tutaj.' })),
    h('div', { class: 'post-actions', style: 'margin:0;flex-wrap:nowrap' }, paste, gen));
}

const PASTE_FORMAT = { tiktok: 'short', instagram: 'reel', facebook: 'post' };
const noAI = (s, n) => String(s ?? '').replace(/\b(AI|A\.I\.|sztuczn\w+ inteligencj\w+|ChatGPT|Claude|GPT-?\d*)\b/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, n);
function parsePosts(text) {
  const t = String(text).trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = fenced ? fenced[1] : t;
  if (!/^[[{]/.test(raw.trim())) { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); if (a >= 0 && b > a) raw = raw.slice(a, b + 1); }
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : Array.isArray(data.posts) ? data.posts : [data];
  return list.map((p) => {
    const platform = String(p.platform || '').toLowerCase();
    if (!PASTE_FORMAT[platform]) throw new Error(`Nieznana platforma: „${p.platform}” (dozwolone: tiktok, instagram, facebook).`);
    const tags = (Array.isArray(p.hashtags) ? p.hashtags : String(p.hashtags || '').split(/[\s,]+/))
      .map((x) => '#' + String(x).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter((x) => x.length > 2).slice(0, 10);
    return {
      platform, format: PASTE_FORMAT[platform], status: 'DO_AKCEPTACJI',
      topic: noAI(p.topic || p.temat, 200) || 'Bez tematu', trend_note: noAI(p.trend_note || p.trend, 1000) || null,
      hook: noAI(p.hook, 300) || null,
      script: platform === 'facebook' ? [] : (Array.isArray(p.script || p.scenariusz) ? (p.script || p.scenariusz) : []).slice(0, 10)
        .map((s) => ({ czas: noAI(s.czas, 20), ujecie: noAI(s.ujecie, 300), lektor: noAI(s.lektor, 300), napis: noAI(s.napis, 80) })),
      caption: noAI(p.caption || p.opis, 2100), hashtags: tags, cta: noAI(p.cta, 300) || null,
    };
  });
}
function pasteSheet() {
  const area = h('textarea', { class: 'textarea', style: 'min-height:220px;font-family:var(--mono);font-size:13px', placeholder: 'Wklej tu całą odpowiedź z czatu (blok JSON).' });
  const out = h('p', { class: 'form-msg' });
  openSheet('Wklej propozycje z czatu',
    h('p', { class: 'small muted', style: 'margin-top:0', text: 'Wszystkie trafią do zakładki „Do akceptacji”. Nic nie zostanie opublikowane bez Twojego zatwierdzenia.' }),
    h('label', { class: 'field' }, area),
    h('button', { class: 'btn btn-gold btn-block', type: 'button', text: 'Dodaj do akceptacji', onclick: async (e) => {
      let rows; out.className = 'form-msg';
      try { rows = parsePosts(area.value); } catch (err) { out.className = 'form-msg err'; out.textContent = `Nie mogę odczytać: ${err.message}`; return; }
      if (!rows.length) { out.className = 'form-msg err'; out.textContent = 'Brak postów w wklejonym tekście.'; return; }
      const b = e.currentTarget; busy(b, true, 'Dodaję…');
      const { error } = await sb.from('ai_posts').insert(rows);
      busy(b, false, 'Dodaj do akceptacji');
      if (error) { out.className = 'form-msg err'; out.textContent = postErr(error); return; }
      sheet.close(); toast('ok', `Dodano ${rows.length} propozycji do akceptacji.`); vibrate(20);
      S.socFilter = 'review'; loadSocial(); refreshBadges();
    } }), out);
  setTimeout(() => area.focus(), 50);
}
function renderSocial() {
  renderRunBar();
  $('#socChips').replaceChildren(...Object.entries(SOC_FILTERS).map(([k, [label, st]]) => h('button', {
    class: 'chip', role: 'tab', type: 'button', 'aria-selected': String(k === S.socFilter), onclick: () => { S.socFilter = k; renderSocial(); },
  }, label, h('span', { class: 'n', text: String(S.posts.filter((p) => st.includes(p.status)).length) }))));
  const list = S.posts.filter((p) => SOC_FILTERS[S.socFilter][1].includes(p.status));
  const box = $('#socList');
  if (!list.length) { box.replaceChildren(h('div', { class: 'empty', text: S.socFilter === 'review' ? 'Nic nie czeka na akceptację. Przygotuj posty z Claude w czacie i kliknij „Wklej z czatu”.' : 'Pusto.' })); return; }
  box.replaceChildren(...list.map(postCard));
}
function postCard(p) {
  const [lbl, tone] = POST_STATUS[p.status] || [p.status, ''];
  const editable = ['DO_AKCEPTACJI', 'ZATWIERDZONY', 'BLAD', 'ODRZUCONY'].includes(p.status);
  const needsMedia = p.platform !== 'facebook';
  const caption = h('textarea', { class: 'textarea', 'aria-label': 'Opis posta', maxlength: 2200, disabled: !editable }); caption.value = p.caption || '';
  const tags = h('input', { class: 'input', 'aria-label': 'Hashtagi', value: (p.hashtags || []).join(' '), disabled: !editable });
  const when = h('input', { class: 'input', type: 'datetime-local', 'aria-label': 'Termin publikacji', disabled: !editable });
  if (p.scheduled_for) { const d = new Date(p.scheduled_for); when.value = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  const fileIn = h('input', { type: 'file', class: 'hidden', accept: needsMedia ? 'video/mp4,video/quicktime' + (p.platform === 'instagram' ? ',image/jpeg,image/png' : '') : 'image/jpeg,image/png,video/mp4' });
  const edits = () => {
    const out = {}; const t = tags.value.split(/[\s,]+/).filter(Boolean).map((x) => '#' + x.replace(/^#+/, '')).slice(0, 30);
    if (caption.value !== (p.caption || '')) out.caption = caption.value;
    if (t.join(' ') !== (p.hashtags || []).join(' ')) out.hashtags = t;
    const sched = when.value ? new Date(when.value).toISOString() : null;
    if (sched !== (p.scheduled_for ? new Date(p.scheduled_for).toISOString() : null)) out.scheduled_for = sched;
    return out;
  };
  const update = async (btn, label, patch, ok) => {
    busy(btn, true);
    const { error } = await sb.from('ai_posts').update(patch).eq('id', p.id);
    if (error) { busy(btn, false, label); return toast('err', postErr(error)); }
    toast('ok', ok); vibrate(20); loadSocial(); refreshBadges();
  };
  const actions = [];
  if (editable) actions.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zapisz zmiany', onclick: (e) => {
    const patch = edits(); if (!Object.keys(patch).length) return toast('info', 'Brak zmian.');
    update(e.currentTarget, 'Zapisz zmiany', patch, p.status === 'ZATWIERDZONY' ? 'Zapisano – post wrócił do akceptacji.' : 'Zapisano.');
  } }));
  if (['DO_AKCEPTACJI', 'BLAD', 'ODRZUCONY'].includes(p.status)) {
    actions.push(h('button', { class: 'btn btn-ok btn-sm', type: 'button', text: when.value ? 'Zatwierdź na termin' : 'Zatwierdź', disabled: needsMedia && !p.media_url, title: needsMedia && !p.media_url ? 'Najpierw dodaj film' : null,
      onclick: (e) => update(e.currentTarget, 'Zatwierdź', { ...edits(), status: 'ZATWIERDZONY' }, when.value ? 'Zatwierdzono – opublikuję o wybranej porze.' : 'Zatwierdzono. Opublikujesz przyciskiem „Publikuj teraz”.') }));
  }
  if (p.status === 'ZATWIERDZONY') actions.push(h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Publikuj teraz', onclick: async (e) => {
    if (!confirm(`Opublikować na ${PF[p.platform]}?`)) return;
    const b = e.currentTarget; busy(b, true, 'Publikuję…');
    try { const d = await callFn('publish-post', { post_id: p.id }); const st = d.post?.status; toast(st === 'BLAD' ? 'err' : 'ok', st === 'BLAD' ? (d.post.publish_note || 'Publikacja nieudana.') : (d.post.publish_note || 'Opublikowano!'), 8000); vibrate(30); }
    catch (err) { toast('err', err.message); }
    loadSocial();
  } }));
  if (['DO_AKCEPTACJI', 'ZATWIERDZONY'].includes(p.status)) actions.push(h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Odrzuć', onclick: () => rejectSheet(p) }));
  actions.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Kopiuj opis', onclick: async () => { try { await navigator.clipboard.writeText([caption.value, tags.value].filter(Boolean).join('\n\n')); toast('ok', 'Skopiowano.'); } catch { toast('err', 'Nie udało się skopiować.'); } } }));
  if (['DO_AKCEPTACJI', 'ODRZUCONY', 'BLAD'].includes(p.status)) actions.push(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Usuń propozycję', text: '🗑', onclick: async () => {
    if (!confirm('Usunąć tę propozycję?')) return;
    if (p.media_path) await sb.storage.from('social-media').remove([p.media_path]);
    const { error } = await sb.from('ai_posts').delete().eq('id', p.id);
    if (error) return toast('err', postErr(error)); toast('ok', 'Usunięto.'); loadSocial(); refreshBadges();
  } }));

  return h('article', { class: 'card post' },
    h('div', { class: 'post-h' }, h('span', { class: `pf ${p.platform}`, text: PF[p.platform] }), h('span', { class: 'pill ghost', text: FORMAT[p.format] || p.format }),
      h('span', { class: `pill ${tone}`, text: lbl }), h('span', { class: 'when', text: ago(p.created_at) })),
    h('h4', { text: p.topic }),
    p.trend_note ? h('p', { class: 'trend', text: p.trend_note }) : null,
    p.hook ? h('p', { class: 'hook', text: p.hook }) : null,
    p.script?.length ? h('details', { class: 'more', open: p.status === 'DO_AKCEPTACJI' },
      h('summary', { text: `Scenariusz (${p.script.length} scen)` }),
      h('ol', { class: 'scenes' }, p.script.map((s) => h('li', {}, h('time', { text: s.czas }), h('div', {}, h('em', { text: s.ujecie }), s.lektor ? h('q', { text: s.lektor }) : null, s.napis ? h('span', { class: 'ov', text: s.napis }) : null))))) : null,
    p.media_url ? h('div', { class: 'media-box' }, p.media_type === 'video' ? h('video', { src: p.media_url, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src: p.media_url, alt: 'Materiał do posta', loading: 'lazy' })) : null,
    editable ? h('div', { class: 'post-actions', style: 'margin:4px 0 10px' }, fileIn,
      h('button', { class: `btn ${needsMedia && !p.media_url ? 'btn-gold' : 'btn-ghost'} btn-sm`, type: 'button', text: p.media_url ? 'Zmień plik' : needsMedia ? '🎬 Dodaj nagrany film' : '🖼 Dodaj zdjęcie (opcjonalnie)', onclick: () => fileIn.click() }),
      needsMedia && p.script?.length ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '🎞 Zrób film z napisów', onclick: () => videoSheet(p) }) : null,
      needsMedia && !p.media_url ? h('span', { class: 'muted small', style: 'align-self:center', text: 'Nagraj wg scenariusza albo zrób film z napisów' }) : null) : null,
    h('label', { class: 'field' }, h('span', { text: 'Opis' }), caption),
    h('label', { class: 'field' }, h('span', { text: 'Hashtagi' }), tags),
    editable ? h('label', { class: 'field' }, h('span', { text: 'Termin publikacji (puste = ręcznie)' }), when) : p.scheduled_for ? h('p', { class: 'note-line', text: `Termin: ${fmt(p.scheduled_for)}` }) : null,
    p.publish_note ? h('p', { class: `note-line${p.status === 'BLAD' ? ' err' : ''}`, text: p.publish_note }) : null,
    p.reject_reason ? h('p', { class: 'note-line', text: `Powód odrzucenia: ${p.reject_reason}` }) : null,
    p.external_url ? h('p', { class: 'note-line' }, h('a', { class: 'gold', href: p.external_url, target: '_blank', rel: 'noopener', text: `Zobacz na ${PF[p.platform]} ↗` })) : null,
    h('div', { class: 'post-actions' }, actions),
    (() => { fileIn.addEventListener('change', () => uploadMedia(p, fileIn)); return null; })());
}
async function uploadMedia(p, input) {
  const f = input.files[0]; if (!f) return;
  return attachMedia(p, f);
}
async function attachMedia(p, f) {
  const type = String(f.type || '').split(';')[0];
  const ok = ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png'];
  if (!ok.includes(type)) return toast('err', 'Dozwolone: MP4, MOV, WEBM, JPG, PNG.');
  if (f.size > 50 * 1024 * 1024) return toast('err', 'Plik większy niż 50 MB – skompresuj go (np. 1080p, 30 kl./s).');
  toast('info', 'Wysyłam plik…', 3000);
  const ext = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png' }[type];
  const path = `${p.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await sb.storage.from('social-media').upload(path, f, { contentType: type, upsert: false });
  if (error) return toast('err', `Nie udało się wgrać: ${error.message}`);
  const { data: pub } = sb.storage.from('social-media').getPublicUrl(path);
  const { error: e2 } = await sb.from('ai_posts').update({ media_path: path, media_url: pub.publicUrl, media_type: type.startsWith('video') ? 'video' : 'image' }).eq('id', p.id);
  if (e2) { await sb.storage.from('social-media').remove([path]); return toast('err', postErr(e2)); }
  if (p.media_path) sb.storage.from('social-media').remove([p.media_path]);
  toast('ok', 'Plik dodany.'); vibrate(20); loadSocial();
}
function rejectSheet(p) {
  const why = h('textarea', { class: 'textarea', maxlength: 500, placeholder: 'Np. „temat już był”, „za mało konkretów” – pomaga ocenić kolejne propozycje.' });
  openSheet('Odrzuć propozycję', h('p', { class: 'small muted', style: 'margin-top:0', text: p.topic }), h('label', { class: 'field' }, h('span', { text: 'Powód (opcjonalnie)' }), why),
    h('button', { class: 'btn btn-danger btn-block', type: 'button', text: 'Odrzuć', onclick: async (e) => {
      const b = e.currentTarget; busy(b, true);
      const { error } = await sb.from('ai_posts').update({ status: 'ODRZUCONY', reject_reason: why.value.trim() || null }).eq('id', p.id);
      if (error) { busy(b, false, 'Odrzuć'); return toast('err', postErr(error)); }
      sheet.close(); toast('ok', 'Odrzucono.'); loadSocial(); refreshBadges();
    } }));
}

/* ================================================================== FINANSE */
async function loadFinance() {
  const out = $('#finOut'); if (!S.fin) out.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton', style: 'height:180px;margin-top:10px' }));
  try { S.fin = await callFn('admin-finance', { days: 30 }); renderFinance(); }
  catch (e) { out.replaceChildren(h('div', { class: 'empty', text: e.message })); }
}
function delta(cur, prev) {
  if (!prev) return cur ? h('span', { class: 'delta up', text: 'nowe' }) : null;
  const p = Math.round((cur - prev) / prev * 100);
  return h('span', { class: `delta ${p >= 0 ? 'up' : 'down'}`, text: `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs poprz. mies.` });
}
function chart(daily) {
  const W = 340, H = 160, pad = 18, n = daily.length, max = Math.max(1, ...daily.map((d) => d.paid));
  const bw = (W - pad) / n, NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Wpływy dzienne z ${n} dni, maksymalnie ${zl(max)}`);
  const el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
  el('line', { x1: pad, x2: W, y1: H - 16, y2: H - 16 });
  daily.forEach((d, i) => {
    const hgt = d.paid ? Math.max(3, (d.paid / max) * (H - 34)) : 2;
    const r = el('rect', { class: `b${d.paid ? '' : ' zero'}`, x: pad + i * bw + 1, y: H - 16 - hgt, width: Math.max(2, bw - 2), height: hgt, rx: 2 });
    const t = document.createElementNS(NS, 'title'); t.textContent = `${d.day}: ${zl(d.paid)} (${d.count})`; r.append(t);
    const last = i === n - 1;
    if ((i % 7 === 0 && n - 1 - i > 3) || last) el('text', { x: last ? W : pad + i * bw, y: H - 3, 'text-anchor': last ? 'end' : 'start' }).textContent = d.day.slice(8, 10) + '.' + d.day.slice(5, 7);
  });
  el('text', { x: 0, y: 12 }).textContent = (max / 100).toFixed(0);
  return svg;
}
function renderFinance() {
  const { stats: s, stripe: st, generated_at } = S.fin;
  const out = $('#finOut');
  const kpi = (label, val, extra) => h('div', { class: 'kpi hud' }, h('span', { text: label }), h('b', { text: val }), extra || null);
  out.replaceChildren(
    h('div', { class: 'kpi-grid' },
      kpi('Dziś', zl(s.today.paid), h('span', { class: 'delta muted', text: `${s.today.count} płatności` })),
      kpi('7 dni', zl(s.last7.paid), h('span', { class: 'delta muted', text: `${s.last7.count} płatności` })),
      kpi('Ten miesiąc', zl(s.month.paid), delta(s.month.paid, s.prev_month_same_period.paid)),
      kpi('Poprzedni miesiąc', zl(s.prev_month.paid), h('span', { class: 'delta muted', text: `${s.prev_month.count} płatności` }))),
    h('p', { class: 'sec-title', text: 'Wpływy – ostatnie 30 dni' }),
    h('div', { class: 'card' }, chart(s.daily)),
    h('p', { class: 'sec-title', text: 'Stripe' }),
    st.ok ? h('div', { class: 'card kv' },
      h('div', {}, h('span', { text: 'Saldo dostępne' }), h('b', { class: 'gold', text: zl(st.available) })),
      h('div', {}, h('span', { text: 'W drodze (pending)' }), h('b', { text: zl(st.pending) })),
      h('div', {}, h('span', { text: `Brutto ${st.period.days} dni` }), h('b', { text: `${zl(st.period.gross)} · ${st.period.payments} płatn.` })),
      h('div', {}, h('span', { text: 'Opłaty Stripe' }), h('b', { text: `−${zl(st.period.fees)}` })),
      st.period.refunds ? h('div', {}, h('span', { text: 'Zwroty' }), h('b', { class: 'down', text: `−${zl(st.period.refunds)}` })) : null,
      h('div', {}, h('span', { text: 'Netto' }), h('b', { text: zl(st.period.net) })),
      h('div', {}, h('span', { text: 'Tryb' }), h('b', { text: st.live ? 'LIVE' : 'TESTOWY (sk_test_)' })))
      : h('div', { class: 'card muted small', text: `Stripe niedostępny: ${st.error || 'brak danych'}` }),
    st.ok && st.payouts?.length ? [h('p', { class: 'sec-title', text: 'Ostatnie wypłaty' }), h('div', { class: 'card kv' }, st.payouts.map((p) => h('div', {}, h('span', { text: fmt(new Date(p.arrival * 1000).toISOString(), { dateStyle: 'medium' }) }), h('b', { text: `${zl(p.amount)} · ${p.status === 'paid' ? 'wypłacone' : p.status}` }))))] : null,
    h('p', { class: 'sec-title', text: 'Usługi w tym miesiącu' }),
    s.by_service.length ? h('div', { class: 'card' }, h('ul', { class: 'bars' }, s.by_service.map((x) => h('li', {},
      h('div', {}, h('span', { text: x.name }), h('b', { text: `${zl(x.paid)} · ${x.count}×` })),
      h('i', { style: `width:${Math.max(4, Math.round(x.paid / s.by_service[0].paid * 100))}%` })))))
      : h('div', { class: 'empty', text: 'Brak opłaconych zleceń w tym miesiącu.' }),
    h('p', { class: 'sec-title', text: 'Do rozliczenia' }),
    h('div', { class: 'card kv' },
      h('div', {}, h('span', { text: 'Dopłaty przy odbiorze (zaliczki)' }), h('b', { text: zl(s.outstanding) })),
      h('div', {}, h('span', { text: 'W realizacji' }), h('b', { text: String(Object.values(s.pipeline || {}).reduce((a, b) => a + b, 0)) })),
      h('div', {}, h('span', { text: 'Czeka na płatność' }), h('b', { text: String(s.pending_payment) }))),
    h('p', { class: 'free-note', text: `Zaktualizowano ${fmt(generated_at, { timeStyle: 'short' })} · kwoty brutto w PLN` }));
}

/* ================================================================== DZIŚ */
async function loadToday() {
  $('#todayDate').textContent = new Date().toLocaleDateString('pl-PL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const out = $('#todayOut'); if (!out.childElementCount) out.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const day = todayKey();
  const [slots, fin, posts, inq] = await Promise.all([
    sb.from('calendar_slots').select('id,starts_at,ends_at,status,order_id')
      .gte('starts_at', `${addDays(day, -1)}T12:00:00Z`).lt('starts_at', `${addDays(day, 1)}T12:00:00Z`)
      .in('status', ['ZAKONCZONA_REZERWACJA', 'ZABLOKOWANA']).order('starts_at'),
    sb.rpc('admin_finance_stats', { p_days: 7 }),
    sb.from('ai_posts').select('id', { head: true, count: 'exact' }).eq('status', 'DO_AKCEPTACJI'),
    sb.from('inquiries').select('id,kind,name,email,phone,topic,message,created_at').eq('handled', false).order('created_at', { ascending: false }).limit(10),
    loadOrders(),
  ]);
  const todays = (slots.data || []).filter((s) => dayKeyOf(new Date(s.starts_at)) === day);
  const newOrders = S.orders.filter((o) => o.status === 'OPLACONE');
  const inWork = S.orders.filter((o) => ['W_REALIZACJI', 'TESTY'].includes(o.status));
  const st = fin.data || {};
  const tile = (icon, val, label, tab, filter) => h('button', { type: 'button', onclick: () => { if (filter) S.ordFilter = filter; openTab(tab); if (tab === 'orders') renderOrders(); } }, h('b', { text: icon }), h('span', { class: 'gold', style: 'font-size:.95rem;font-weight:800', text: val }), label);
  const now = Date.now();
  const schedule = todays.length ? todays.map((s) => {
    const o = S.orders.find((x) => x.id === s.order_id);
    const live = new Date(s.starts_at) <= now && new Date(s.ends_at) > now;
    return h('div', { class: `card slot ${s.status}${live ? ' now-line' : ''}`, style: o ? 'cursor:pointer' : '', onclick: o ? () => orderSheet(o.id) : null },
      h('time', { text: hm(s.starts_at) }, h('span', { text: hm(s.ends_at) })),
      h('div', {}, h('h4', { text: o ? o.service_name : 'Blokada' }),
        h('p', { text: o ? `${o.order_number || ''} · ${o.customer?.name || o.profiles?.full_name || ''}` : 'niedostępne dla klientów' }),
        live ? h('span', { class: 'pill ok', text: 'teraz' }) : null),
      o ? h('span', { class: 'go gold', text: '›' }) : h('span'));
  }) : [h('div', { class: 'empty', text: 'Brak terminów na dziś.' })];
  const alerts = [];
  if (newOrders.length) alerts.push(h('div', { class: 'card alert-card', onclick: () => { S.ordFilter = 'active'; openTab('orders'); renderOrders(); } },
    h('span', { class: 'big', text: String(newOrders.length) }), h('div', {}, h('b', { text: 'Nowe opłacone zlecenia' }), h('p', { text: 'Przyjmij je – przesuń kartę w prawo.' })), h('span', { class: 'go', text: '›' })));
  if (posts.count) alerts.push(h('div', { class: 'card alert-card', onclick: () => { S.socFilter = 'review'; openTab('social'); } },
    h('span', { class: 'big', text: String(posts.count) }), h('div', {}, h('b', { text: 'Posty do akceptacji' }), h('p', { text: 'Sprawdź i zatwierdź w zakładce Social.' })), h('span', { class: 'go', text: '›' })));
  out.replaceChildren(...[
    h('div', { class: 'quick' },
      tile('💰', zl(st.today?.paid ?? 0), 'dziś', 'finance'),
      tile('🆕', String(newOrders.length), 'nowe', 'orders', 'active'),
      tile('🔧', String(inWork.length), 'w realizacji', 'orders', 'active'),
      tile('📣', String(posts.count || 0), 'posty', 'social')),
    alerts,
    h('div', { class: 'section-h' }, h('h3', { text: `Terminy dziś (${todays.length})` }), h('button', { type: 'button', text: 'Kalendarz ›', onclick: () => { S.cal.day = day; openTab('calendar'); } })),
    h('div', { class: 'list' }, schedule),
    (inq.data || []).length ? [h('div', { class: 'section-h' }, h('h3', { text: `Zapytania i wiadomości (${inq.data.length})` })),
      h('div', { class: 'list' }, inq.data.map((q) => h('button', { class: 'card client', type: 'button', onclick: () => inquirySheet(q) },
        h('div', { class: 'ord-h' }, h('span', { class: `pill ${q.kind === 'quote' ? 'info' : 'ghost'}`, text: q.kind === 'quote' ? 'Wycena PC' : 'Kontakt' }), h('span', { class: 'muted small', text: ago(q.created_at) })),
        h('h4', { style: 'margin-top:6px', text: q.name }), h('p', { class: 'small muted', style: 'margin:0', text: q.topic || q.message.slice(0, 80) }))))] : null,
    h('p', { class: 'free-note', text: `7 dni: ${zl(st.last7?.paid ?? 0)} · ten miesiąc: ${zl(st.month?.paid ?? 0)}` })].flat(Infinity).filter(Boolean));
}
function inquirySheet(q) {
  openSheet(q.kind === 'quote' ? 'Zapytanie o wycenę' : 'Wiadomość',
    h('div', { class: 'kv' }, h('div', {}, h('span', { text: 'Od' }), h('b', { text: q.name })), h('div', {}, h('span', { text: 'E-mail' }), h('b', { text: q.email })),
      q.phone ? h('div', {}, h('span', { text: 'Telefon' }), h('b', { text: q.phone })) : null, h('div', {}, h('span', { text: 'Kiedy' }), h('b', { text: fmt(q.created_at) }))),
    q.topic ? h('h4', { text: q.topic }) : null,
    h('p', { class: 'small', style: 'white-space:pre-wrap', text: q.message }),
    h('div', { class: 'post-actions' },
      h('a', { class: 'btn btn-gold btn-sm', href: `mailto:${q.email}?subject=${encodeURIComponent('Re: ' + (q.topic || 'Strike Tech Lab'))}`, text: '✉ Odpowiedz' }),
      q.phone ? h('a', { class: 'btn btn-ghost btn-sm', href: `tel:${q.phone.replace(/\s/g, '')}`, text: '📞 Zadzwoń' }) : null,
      h('button', { class: 'btn btn-ok btn-sm', type: 'button', text: '✓ Obsłużone', onclick: async () => {
        const { error } = await sb.from('inquiries').update({ handled: true }).eq('id', q.id);
        if (error) return toast('err', error.message); sheet.close(); toast('ok', 'Oznaczono jako obsłużone.'); loadToday();
      } })));
}

/* ================================================================== PRZESUNIĘCIE = KOLEJNY ETAP */
const NEXT_STATUS = { OPLACONE: 'W_REALIZACJI', W_REALIZACJI: 'TESTY', TESTY: 'ZAKONCZONE' };
function swipeable(card, o) {
  const next = NEXT_STATUS[o.status]; if (!next) return card;
  const bg = h('div', { class: 'swipe-bg', style: 'opacity:0' }, h('span', { text: `→ ${STATUS[next][0]}` }));
  const wrap = h('div', { class: 'swipe-wrap' }, bg, card);
  let x0 = null, y0 = 0, dx = 0, locked = false;
  card.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; dx = 0; locked = false; });
  card.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!locked) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
      if (mx < 12) return;
      locked = true; card.classList.add('dragging'); try { card.setPointerCapture(e.pointerId); } catch { /* */ }
    }
    dx = Math.max(0, mx); card.style.transform = `translateX(${dx}px)`; bg.style.opacity = String(Math.min(1, dx / 110));
  });
  const end = () => {
    if (x0 === null) return; x0 = null; card.classList.remove('dragging');
    if (!locked) return;
    card._swiped = true; setTimeout(() => { card._swiped = false; }, 400);
    if (dx > wrap.clientWidth * 0.35) { card.style.transform = `translateX(${wrap.clientWidth}px)`; vibrate(25); queueStatus(o, next, wrap); }
    else { card.style.transform = ''; bg.style.opacity = '0'; }
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  return wrap;
}
function queueStatus(o, next, wrap) {
  let cancelled = false;
  const t = h('div', { class: 'toast info', role: 'status' }, h('span', { text: `${o.order_number || 'Zlecenie'} → ${STATUS[next][0]}` }),
    h('button', { class: 'undo', type: 'button', text: 'Cofnij', onclick: () => { cancelled = true; t.remove(); renderOrders(); } }));
  $('#toasts').append(t);
  setTimeout(async () => {
    t.remove(); if (cancelled) return;
    try { await callFn('admin', { action: 'set_status', order_id: o.id, status: next, note: '' }); toast('ok', `${o.order_number}: ${STATUS[next][0]}`); }
    catch (e) { toast('err', e.message); }
    await loadOrders(); if (S.tab === 'today') loadToday();
  }, 4000);
}

/* ================================================================== ZDJĘCIA PRZY PRZYJĘCIU */
function photoTools(o, thumbs) {
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
  const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
  const go = (inp) => async () => { if (inp.files.length) await uploadPhotos(o, [...inp.files], thumbs); inp.value = ''; };
  cam.addEventListener('change', go(cam)); gal.addEventListener('change', go(gal));
  return [h('div', { class: 'post-actions', style: 'margin-top:0' }, cam, gal,
    h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '📷 Zrób zdjęcie', onclick: () => cam.click() }),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '🖼 Z galerii', onclick: () => gal.click() })),
  h('p', { class: 'hint', style: 'margin:6px 2px 0', text: 'Stan obudowy, numer seryjny, uszkodzenia. Klient też je zobaczy – to chroni obie strony.' }), thumbs];
}
async function shrinkImage(file, max = 1600, q = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
}
async function uploadPhotos(o, files, thumbs) {
  toast('info', `Wysyłam ${files.length} ${files.length === 1 ? 'zdjęcie' : 'zdjęć'}…`, 3000);
  let ok = 0;
  for (const [i, f] of files.entries()) {
    try {
      const blob = await shrinkImage(f);
      const { error } = await sb.storage.from('reports').upload(`${o.user_id}/${o.id}/${Date.now()}-Przyjecie-${i + 1}.jpg`, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error; ok++;
    } catch (e) { toast('err', `Zdjęcie ${i + 1}: ${e.message}`); }
  }
  if (ok) { toast('ok', `Dodano zdjęcia: ${ok}.`); vibrate(20); }
  loadReportFiles(o, thumbs.parentElement?.querySelector('.files') || h('div'), thumbs);
}
async function renderThumbs(folder, photos, box) {
  if (!photos.length) { box.replaceChildren(); return; }
  const { data } = await sb.storage.from('reports').createSignedUrls(photos.map((f) => `${folder}/${f.name}`), 600);
  box.replaceChildren(...(data || []).filter((x) => x.signedUrl).map((x) => h('img', { src: x.signedUrl, alt: 'Zdjęcie przy przyjęciu', loading: 'lazy', onclick: () => window.open(x.signedUrl, '_blank', 'noopener') })));
}

/* ================================================================== KLIENCI */
function clientsIndex() {
  const map = new Map();
  for (const o of S.orders) {
    const key = o.user_id || o.customer?.email || o.profiles?.email; if (!key) continue;
    const c = map.get(key) || { key, user_id: o.user_id, name: '', email: '', phone: '', orders: [], paid: 0, last: '' };
    c.name ||= o.customer?.name || o.profiles?.full_name || ''; c.email ||= o.profiles?.email || o.customer?.email || ''; c.phone ||= o.customer?.phone || o.profiles?.phone || '';
    c.orders.push(o); if (o.paid_at && o.status !== 'ANULOWANE') c.paid += o.amount_due_grosze || 0;
    if (o.created_at > c.last) c.last = o.created_at;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}
async function clientsSheet() {
  if (!S.orders.length) await loadOrders();
  const all = clientsIndex();
  const list = h('div', { class: 'list' });
  const search = h('input', { class: 'input search', type: 'search', placeholder: `Szukaj wśród ${all.length} klientów`, oninput: (e) => draw(e.target.value.trim().toLowerCase()) });
  const draw = (q = '') => list.replaceChildren(...all.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)).slice(0, 100).map((c) =>
    h('button', { class: 'card client', type: 'button', onclick: () => clientSheet(c) },
      h('h4', { text: c.name || c.email || 'Klient' }),
      h('div', { class: 'ord-meta' }, h('span', { text: `${c.orders.length} ${c.orders.length === 1 ? 'zlecenie' : 'zleceń'}` }), h('span', {}, h('b', { class: 'gold', text: zl(c.paid) })), h('span', { text: `ostatnio ${fmt(c.last, { day: 'numeric', month: 'short' })}` })))));
  draw();
  openSheet(`Klienci (${all.length})`, search, list);
}
async function clientSheet(c) {
  const refs = c.user_id ? await sb.from('referrals').select('id,status', { count: 'exact' }).eq('referrer_id', c.user_id) : { count: 0 };
  const paidOrders = c.orders.filter((o) => o.paid_at && o.status !== 'ANULOWANE');
  openSheet(c.name || c.email || 'Klient',
    h('div', { class: 'kv' },
      c.email ? h('div', {}, h('span', { text: 'E-mail' }), h('b', { text: c.email })) : null,
      c.phone ? h('div', {}, h('span', { text: 'Telefon' }), h('b', { text: c.phone })) : null,
      h('div', {}, h('span', { text: 'Wydał łącznie' }), h('b', { class: 'gold', text: zl(c.paid) })),
      h('div', {}, h('span', { text: 'Opłacone zlecenia' }), h('b', { text: String(paidOrders.length) })),
      paidOrders.length ? h('div', {}, h('span', { text: 'Średnia wartość' }), h('b', { text: zl(Math.round(c.paid / paidOrders.length)) })) : null,
      h('div', {}, h('span', { text: 'Polecił klientów' }), h('b', { text: String(refs.count ?? 0) }))),
    h('div', { class: 'post-actions' },
      c.phone ? h('a', { class: 'btn btn-ghost btn-sm', href: `tel:${c.phone.replace(/\s/g, '')}`, text: '📞 Zadzwoń' }) : null,
      c.email ? h('a', { class: 'btn btn-ghost btn-sm', href: `mailto:${c.email}`, text: '✉ E-mail' }) : null,
      c.orders[0] ? h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '💬 Szablon', onclick: () => messageSheet(c.orders[0]) }) : null),
    h('h4', { text: 'Historia zleceń' }),
    h('div', { class: 'list' }, c.orders.map((o) => h('button', { class: 'card ord', type: 'button', onclick: () => orderSheet(o.id) },
      h('div', { class: 'ord-h' }, h('span', { class: 'ord-num', text: o.order_number || 'bez numeru' }), h('span', { class: `pill ${STATUS[o.status]?.[1] || ''}`, text: STATUS[o.status]?.[0] || o.status })),
      h('h4', { text: o.service_name }), h('div', { class: 'ord-meta' }, h('span', { text: fmt(o.created_at, { dateStyle: 'medium' }) }), h('span', { text: zl(o.total_grosze) }))))));
}
$('#clientsBtn').addEventListener('click', () => { vibrate(); clientsSheet(); });

/* ================================================================== SZABLONY WIADOMOŚCI */
const TPL_DEFAULT = [
  { id: 'remind', name: 'Przypomnienie o terminie', text: 'Dzień dobry {imie}, przypominam o terminie {termin} – {usluga}. Przy usłudze zdalnej proszę mieć zainstalowany AnyDesk. Do zobaczenia! Strike Tech Lab' },
  { id: 'start', name: 'Rozpoczęcie prac', text: 'Dzień dobry {imie}, zaczynamy pracę nad zleceniem {numer}. Postęp widać na bieżąco w Strefie Klienta na striketechlab.com. Strike Tech Lab' },
  { id: 'quote', name: 'Prośba o akceptację wyceny', text: 'Dzień dobry {imie}, przy zleceniu {numer} potrzebna jest dodatkowa praca lub część: [OPIS] – koszt [KWOTA] zł. Czy mogę to wykonać? Bez Pana/Pani zgody nic nie robię. Strike Tech Lab' },
  { id: 'ready', name: 'Sprzęt gotowy do odbioru', text: 'Dzień dobry {imie}, zlecenie {numer} ({usluga}) jest gotowe do odbioru. Raport z pomiarów jest w Strefie Klienta na striketechlab.com. Kiedy będzie Panu/Pani pasował odbiór? Strike Tech Lab' },
  { id: 'thanks', name: 'Podziękowanie + polecenia', text: 'Dziękuję za zlecenie {numer}! Jeśli jest Pan/Pani zadowolony/a – znajomi z Pana/Pani kodem polecającym (Strefa Klienta) dostaną 10% rabatu. Strike Tech Lab' },
];
const templates = () => { const t = store.get('stl_tpl'); return Array.isArray(t) && t.length ? t : TPL_DEFAULT; };
function fillTpl(text, o) {
  const name = (o.customer?.name || o.profiles?.full_name || '').trim().split(/\s+/)[0] || '';
  const slot = o.calendar_slots?.[0];
  const v = { imie: name, numer: o.order_number || '', usluga: o.service_name || '', termin: slot ? `${fmt(slot.starts_at, { weekday: 'long', day: 'numeric', month: 'long' })}, godz. ${hm(slot.starts_at)}` : '' };
  return text.replace(/\{(imie|numer|usluga|termin)\}/g, (_, k) => v[k]).replace(/Dzień dobry ,/g, 'Dzień dobry,').replace(/\s{2,}/g, ' ').trim();
}
function messageSheet(o) {
  const phone = (o.customer?.phone || o.profiles?.phone || '').replace(/[^\d+]/g, '');
  const email = o.profiles?.email || o.customer?.email || '';
  let ch = phone ? 'sms' : 'mail';
  const seg = h('div', { class: 'seg2' });
  const list = h('div');
  const drawSeg = () => seg.replaceChildren(...[['sms', 'SMS', !phone], ['wa', 'WhatsApp', !phone], ['mail', 'E-mail', !email]].map(([k, t, dis]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === ch), disabled: dis, text: t, onclick: () => { ch = k; drawSeg(); } })));
  const send = (text) => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const wa = phone.startsWith('+') ? phone.slice(1) : phone.length === 9 ? `48${phone}` : phone;
    const url = ch === 'sms' ? `sms:${phone}${ios ? '&' : '?'}body=${encodeURIComponent(text)}`
      : ch === 'wa' ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}`
        : `mailto:${email}?subject=${encodeURIComponent(`${o.order_number || 'Zlecenie'} – Strike Tech Lab`)}&body=${encodeURIComponent(text)}`;
    location.href = url;
  };
  list.replaceChildren(...templates().map((t) => {
    const text = fillTpl(t.text, o);
    return h('button', { class: 'tpl', type: 'button', onclick: () => {
      if (/\[(OPIS|KWOTA)\]/.test(text)) {
        const ta = h('textarea', { class: 'textarea' }); ta.value = text;
        openSheet(t.name, h('p', { class: 'hint', text: 'Uzupełnij pola w nawiasach kwadratowych.' }), ta,
          h('button', { class: 'btn btn-gold btn-block', type: 'button', text: 'Wyślij', onclick: () => send(ta.value) }));
      } else send(text);
    } }, h('b', { text: t.name }), h('span', { text }));
  }));
  drawSeg();
  openSheet('Wiadomość do klienta', seg, list, h('p', { class: 'hint', text: 'Otworzy się aplikacja SMS / WhatsApp / poczta z gotowym tekstem – sprawdź i wyślij. Szablony zmienisz w ⚙ Ustawieniach.' }));
}

/* ================================================================== USTAWIENIA + POWIADOMIENIA PUSH */
const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, why: /iphone|ipad/i.test(navigator.userAgent) ? 'Na iPhonie powiadomienia działają po instalacji z Safari (Do ekranu początkowego) i iOS 16.4+.' : 'Ta przeglądarka nie obsługuje powiadomień.' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { ok: true, reg, sub, perm: Notification.permission };
}
async function enablePush() {
  const st = await pushState(); if (!st.ok) return toast('err', st.why, 8000);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('err', 'Brak zgody na powiadomienia. Włączysz ją w ustawieniach przeglądarki/telefonu.', 8000);
  try {
    // klucz publiczny tworzy serwer przy pierwszym włączeniu (funkcja notify-push) – nic nie trzeba konfigurować
    const { publicKey } = await callFn('notify-push', { action: 'key' });
    let sub = st.sub;
    if (sub && b64ToBytes(publicKey).join() !== new Uint8Array(sub.options?.applicationServerKey || []).join()) { await sub.unsubscribe(); sub = null; }
    sub ||= await st.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    const device = /android/i.test(navigator.userAgent) ? 'Android' : /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone' : 'Komputer';
    await callFn('notify-push', { action: 'subscribe', subscription: sub.toJSON(), device });
    toast('ok', 'Powiadomienia włączone na tym urządzeniu.'); vibrate(20);
  } catch (e) { toast('err', `Nie udało się włączyć: ${e.message}`, 8000); }
}
async function disablePush() {
  const st = await pushState(); if (!st.ok || !st.sub) return;
  try { await callFn('notify-push', { action: 'unsubscribe', endpoint: st.sub.endpoint }); } catch { /* */ }
  await st.sub.unsubscribe(); toast('ok', 'Powiadomienia wyłączone na tym urządzeniu.');
}
async function settingsSheet() {
  const st = await pushState();
  const on = st.ok && st.sub && st.perm === 'granted';
  const push = h('div', {},
    h('div', { class: 'switch-row' }, h('div', {}, h('b', { text: 'Powiadomienia push' }), h('p', { text: st.ok ? (on ? 'Włączone: nowe opłacone zlecenia i zapytania.' : 'Dostaniesz powiadomienie nawet przy zamkniętej aplikacji.') : st.why })),
      st.ok ? h('button', { class: `btn ${on ? 'btn-ghost' : 'btn-gold'} btn-sm`, type: 'button', text: on ? 'Wyłącz' : 'Włącz', onclick: async () => { on ? await disablePush() : await enablePush(); settingsSheet(); } }) : null),
    on ? h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:10px', type: 'button', text: 'Wyślij powiadomienie testowe', onclick: async (e) => {
      const b = e.currentTarget; busy(b, true);
      try { const d = await callFn('notify-push', { action: 'test' }); toast(d.sent ? 'ok' : 'err', d.sent ? `Wysłano na ${d.sent} ${d.sent === 1 ? 'urządzenie' : 'urządzenia'}.` : 'Nie wysłano – włącz powiadomienia ponownie.'); } catch (err) { toast('err', err.message, 8000); }
      busy(b, false, 'Wyślij powiadomienie testowe');
    } }) : null);
  const tpls = templates().map((t) => ({ ...t }));
  const editors = tpls.map((t) => { const n = h('input', { class: 'input', value: t.name, maxlength: 60 }); const ta = h('textarea', { class: 'textarea', style: 'min-height:90px' }); ta.value = t.text; return { t, n, ta }; });
  openSheet('Ustawienia', push,
    h('h4', { text: 'Szablony wiadomości' }),
    h('p', { class: 'hint', text: 'Pola: {imie} {numer} {usluga} {termin}. [OPIS] i [KWOTA] uzupełniasz przy wysyłce. Szablony są zapisane na tym urządzeniu.' }),
    editors.map(({ n, ta }) => h('div', { class: 'card', style: 'margin-bottom:8px' }, h('label', { class: 'field' }, n), ta)),
    h('div', { class: 'post-actions' },
      h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Zapisz szablony', onclick: () => { store.set('stl_tpl', editors.map(({ t, n, ta }) => ({ id: t.id, name: n.value.trim() || t.name, text: ta.value.trim() }))); toast('ok', 'Szablony zapisane.'); } }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Nowy szablon', onclick: () => { store.set('stl_tpl', [...templates(), { id: `t${Date.now()}`, name: 'Nowy szablon', text: 'Dzień dobry {imie}, ' }]); settingsSheet(); } }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Przywróć domyślne', onclick: () => { if (confirm('Przywrócić domyślne szablony?')) { store.set('stl_tpl', null); settingsSheet(); } } })),
    h('p', { class: 'free-note', text: 'STL Centrum v6' }));
}
$('#settingsBtn').addEventListener('click', () => { vibrate(); settingsSheet(); });

/* ================================================================== GRAFIKA: logo, tekst */
const HEXP = [[627, 303], [853, 417], [853, 697], [627, 872], [400, 697], [400, 417]];
const BOLTP = [[778, 212], [474, 624], [655, 583], [472, 918], [778, 512], [612, 546]];
function drawLogo(ctx, cx, cy, hgt) {
  const k = hgt / 750, P = (pts) => pts.map(([x, y]) => [cx + (x - 630) * k, cy + (y - 565) * k]);
  ctx.save(); ctx.lineJoin = 'miter';
  ctx.shadowColor = 'rgba(255,187,0,.55)'; ctx.shadowBlur = hgt * 0.08;
  ctx.strokeStyle = '#FFBB00'; ctx.lineWidth = 28 * k; ctx.beginPath(); P(HEXP).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.beginPath(); P(BOLTP).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.lineWidth = 34 * k; ctx.strokeStyle = '#080808'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = '#FFBB00'; ctx.fill();
  ctx.restore();
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
async function fontsReady() { try { await Promise.all([document.fonts.load(`800 40px ${FONT}`), document.fonts.load(`500 20px ${FONT}`)]); } catch { /* */ } }

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
/* ================================================================== RAPORT STRIKE PROOF (PDF) – szablon usługi (stl-report.js, wspólny ze stroną) */
let REP = null;
const repModule = () => (REP ||= import('./stl-report.js').catch((e) => { REP = null; throw e; }));
async function reportSheet(o) {
  let R; try { R = await repModule(); } catch { return toast('err', 'Brak pliku stl-report.js – odśwież Centrum.'); }
  const tpl = R.templateFor(o.service_id, o.config?.extras);
  const before = (o.order_results || []).find((r) => r.phase === 'before')?.metrics || {};
  const after = (o.order_results || []).find((r) => r.phase === 'after')?.metrics || {};
  let saved = {}, hasFacts = true;
  let res = await sb.from('order_reports').select('works,recommendations,facts').eq('order_id', o.id).maybeSingle();
  if (res.error && /facts/.test(res.error.message)) { hasFacts = false; res = await sb.from('order_reports').select('works,recommendations').eq('order_id', o.id).maybeSingle(); }
  if (!res.error && res.data) saved = res.data;
  const f0 = saved.facts || {};
  const vStr = (v) => v === undefined || v === null ? '' : String(v).replace(/^(-?\d+)\.(\d+)$/, '$1,$2');
  const factIn = {};
  const facts = tpl.facts.map((f) => {
    const el = f.long ? h('textarea', { class: 'textarea', style: 'min-height:64px', maxlength: 1000, placeholder: f.ph || '' }) : h('input', { class: 'input', maxlength: 200, placeholder: f.ph || '' });
    el.value = f0[f.k] ?? ''; factIn[f.k] = el;
    return h('label', { class: 'field' }, h('span', { class: 'lbl', text: f.l }), el);
  });
  const mIn = [];
  const groups = tpl.groups.map((g) => [h('h4', { text: g.t }),
    h('div', { class: 'metric-h' }, h('span', { text: 'Pomiar' }), h('span', { text: g.one ? '' : 'Przed' }), h('span', { text: g.one ? 'Wynik' : 'Po' }), h('span')),
    g.m.map(([k, l, u]) => {
      const b = g.one ? null : h('input', { class: 'input', inputmode: 'decimal', 'aria-label': `${l} – przed`, value: vStr(before[k]) });
      const a = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': `${l} – ${g.one ? 'wynik' : 'po'}`, value: vStr(after[k]) });
      mIn.push({ key: k, b, a });
      return h('div', { class: `metric${g.one ? ' one' : ''}` }, h('span', { class: 'lbl', text: u ? `${l} (${u})` : l }), b, a, h('span'));
    })]);
  const known = new Set(tpl.groups.flatMap((g) => g.m.map(([k]) => k)));
  const extraBox = h('div');
  const addExtra = (k = '', label = '') => {
    const name = h('input', { class: 'input', placeholder: 'Nazwa, np. Cinebench R23', style: 'font-size:14px', value: label || (k ? R.metricInfo(k).l : '') });
    const b = h('input', { class: 'input', inputmode: 'decimal', value: vStr(before[k]) }), a = h('input', { class: 'input', inputmode: 'decimal', value: vStr(after[k]) });
    const row = { key: k, name, b, a }; mIn.push(row);
    const el = h('div', { class: 'metric' }, name, b, a, h('button', { class: 'x-btn', type: 'button', 'aria-label': 'Usuń', text: '×', onclick: () => { el.remove(); mIn.splice(mIn.indexOf(row), 1); } }));
    extraBox.append(el); return name;
  };
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !known.has(k)).forEach((k) => addExtra(k, f0._labels?.[k]));
  const checkList = (items, txt) => {
    const lines = String(txt || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const boxes = items.map((t) => ({ t, cb: h('input', { type: 'checkbox', checked: lines.length ? lines.includes(t) : true }) }));
    const other = h('textarea', { class: 'textarea', style: 'min-height:60px', placeholder: 'Inne – jedna pozycja w linii' }); other.value = lines.filter((l) => !items.includes(l)).join('\n');
    return { el: [boxes.map((x) => h('label', { class: 'chk-row' }, x.cb, h('span', { text: x.t }))), other],
      value: () => [...boxes.filter((x) => x.cb.checked).map((x) => x.t), ...other.value.split('\n').map((s) => s.trim()).filter(Boolean)] };
  };
  const works = checkList(tpl.works, saved.works), recs = checkList(tpl.recs, saved.recommendations);
  const prev = h('div');
  openSheet(`Raport ${o.order_number}`,
    h('p', { class: 'muted small', text: `Szablon: ${tpl.title}` }),
    h('h4', { text: 'Sprzęt i ustawienia' }), facts,
    groups, h('h4', { text: 'Własne pomiary' }), extraBox,
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Własny pomiar', onclick: () => addExtra().focus() }),
    h('h4', { text: 'Wykonane prace' }), works.el, h('h4', { text: 'Zalecenia' }), recs.el,
    h('button', { class: 'btn btn-gold btn-block', style: 'margin-top:12px', type: 'button', text: 'Zapisz i utwórz PDF', onclick: async (e) => {
      const btn = e.currentTarget;
      const mb = {}, ma = {}, labels = { ...(f0._labels || {}) };
      for (const x of mIn) {
        let k = x.key;
        if (x.name) { const nm = x.name.value.trim(); if (!nm) continue; k = x.key || R.slug(nm); if (!k) continue; labels[k] = nm.slice(0, 60); }
        const vb = x.b ? R.parseVal(x.b.value) : undefined, va = R.parseVal(x.a.value);
        if (vb !== undefined) mb[k] = vb; if (va !== undefined) ma[k] = va;
      }
      const fx = {}; for (const [k, el] of Object.entries(factIn)) { const v = el.value.trim(); if (v) fx[k] = v.slice(0, 1000); }
      const used = new Set([...Object.keys(mb), ...Object.keys(ma)]), lab = Object.fromEntries(Object.entries(labels).filter(([k]) => used.has(k)));
      if (Object.keys(lab).length) fx._labels = lab;
      if (!used.size && !Object.keys(fx).length) return toast('err', 'Wpisz przynajmniej jeden pomiar albo dane sprzętu.');
      const w = works.value(), r = recs.value();
      busy(btn, true, 'Zapisuję…');
      try {
        await callFn('admin', { action: 'save_results', order_id: o.id, phase: 'before', metrics: mb });
        await callFn('admin', { action: 'save_results', order_id: o.id, phase: 'after', metrics: ma });
        const row = { order_id: o.id, works: w.join('\n').slice(0, 4000) || null, recommendations: r.join('\n').slice(0, 2000) || null };
        let err = hasFacts ? (await sb.from('order_reports').upsert({ ...row, facts: fx })).error : null;
        if (!hasFacts || (err && /facts/.test(err.message))) err = (await sb.from('order_reports').upsert(row)).error;
        if (err) console.warn('order_reports', err.message);   // raport i tak powstanie
        busy(btn, true, 'Tworzę PDF…');
        const pages = await R.renderReport({ order: { order_number: o.order_number, service_name: o.service_name, client: o.customer?.company || o.customer?.name || o.profiles?.full_name }, tpl, before: mb, after: ma, facts: fx, works: w, recs: r });
        const pdf = R.toPdf(pages);
        const { error } = await sb.storage.from('reports').upload(`${o.user_id}/${o.id}/${Date.now()}-STRIKE-PROOF-${o.order_number}.pdf`, pdf, { contentType: 'application/pdf', upsert: false });
        if (error) throw error;
        const url = URL.createObjectURL(pdf);
        prev.replaceChildren(h('img', { class: 'report-prev', src: pages[0].preview, alt: 'Podgląd raportu' }),
          h('div', { class: 'post-actions' }, h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', text: `Otwórz PDF (${pages.length} str.)` }),
            o.status !== 'TESTY' && o.status !== 'ZAKONCZONE' ? h('button', { class: 'btn btn-ok btn-sm', type: 'button', text: 'Zmień status na „Testy i raport”', onclick: async (ev) => {
              busy(ev.currentTarget, true); try { await callFn('admin', { action: 'set_status', order_id: o.id, status: 'TESTY', note: 'Raport STRIKE PROOF gotowy' }); toast('ok', 'Status zmieniony.'); sheet.close(); loadOrders(); } catch (er) { toast('err', er.message); }
            } }) : null));
        toast('ok', 'Raport zapisany – klient widzi go w Strefie Klienta.', 7000); vibrate(30);
        busy(btn, false, 'Utwórz ponownie');
        prev.scrollIntoView({ behavior: 'smooth' }); loadOrders();
      } catch (err) { toast('err', err.message); busy(btn, false, 'Zapisz i utwórz PDF'); }
    } }), prev);
}

/* ================================================================== FILM Z NAPISÓW (9:16) */
function sceneSeconds(czas) {
  const m = String(czas || '').match(/(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/);
  const d = m ? parseFloat(m[2].replace(',', '.')) - parseFloat(m[1].replace(',', '.')) : 4;
  return Math.min(7, Math.max(2.5, d || 4));
}
function buildScenes(p) {
  const s = [];
  if (p.hook) s.push({ kind: 'hook', dur: 2.6, big: p.hook });
  for (const sc of p.script || []) s.push({ kind: 'scene', dur: sceneSeconds(sc.czas), big: sc.napis || '', small: sc.lektor || '' });
  s.push({ kind: 'end', dur: 3, big: 'STRIKE TECH LAB', small: (p.cta || 'striketechlab.com').replace(/https?:\/\//, '') });
  let t = 0; for (const x of s) { x.t0 = t; t += x.dur; }
  return { scenes: s, total: t };
}
function drawFrame(ctx, W, H, plan, t) {
  const { scenes, total } = plan;
  const sc = scenes.find((x) => t >= x.t0 && t < x.t0 + x.dur) || scenes[scenes.length - 1];
  const lt = t - sc.t0, idx = scenes.indexOf(sc);
  const ease = (v) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3);
  ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
  const gx = W * (0.5 + 0.35 * Math.sin(t * 0.6)), gy = H * (0.3 + 0.15 * Math.cos(t * 0.45));
  const g = ctx.createRadialGradient(gx, gy, 10, gx, gy, W * 0.95); g.addColorStop(0, 'rgba(255,187,0,.22)'); g.addColorStop(1, 'rgba(255,187,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1; const step = W / 9, off = (t * 30) % step;
  for (let gx2 = -step + off; gx2 < W + step; gx2 += step) { ctx.beginPath(); ctx.moveTo(gx2, 0); ctx.lineTo(gx2, H); ctx.stroke(); }
  for (let gy2 = off; gy2 < H; gy2 += step) { ctx.beginPath(); ctx.moveTo(0, gy2); ctx.lineTo(W, gy2); ctx.stroke(); }
  const hud = W * 0.06, pad = W * 0.05; ctx.strokeStyle = 'rgba(255,187,0,.75)'; ctx.lineWidth = W * 0.006;
  [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + hud * sy); ctx.lineTo(x, y); ctx.lineTo(x + hud * sx, y); ctx.stroke(); });
  const a = ease(lt / 0.45), out = sc.kind !== 'end' && lt > sc.dur - 0.25 ? ease((sc.dur - lt) / 0.25) : 1;
  ctx.globalAlpha = a * out; ctx.textAlign = 'center';
  if (sc.kind === 'end') {
    drawLogo(ctx, W / 2, H * 0.38, W * 0.34 * (0.9 + 0.1 * a));
    ctx.fillStyle = '#fff'; ctx.font = `800 ${W * 0.075}px ${FONT}`; ctx.fillText('STRIKE TECH LAB', W / 2, H * 0.58);
    ctx.fillStyle = '#FFBB00'; ctx.font = `700 ${W * 0.042}px ${FONT}`;
    wrapLines(ctx, sc.small, W * 0.8).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.64 + i * W * 0.058));
  } else {
    const big = sc.kind === 'hook' ? sc.big : sc.big.toUpperCase();
    let fs = W * (sc.kind === 'hook' ? 0.085 : 0.12); ctx.font = `800 ${fs}px ${FONT}`;
    let lines = wrapLines(ctx, big, W * 0.82);
    while ((lines.length > 4 || lines.some((l) => ctx.measureText(l).width > W * 0.86)) && fs > W * 0.05) { fs *= 0.9; ctx.font = `800 ${fs}px ${FONT}`; lines = wrapLines(ctx, big, W * 0.82); }
    const lh = fs * 1.12, yb = H * 0.44 - (lines.length - 1) * lh / 2 + (1 - a) * W * 0.06;
    ctx.shadowColor = 'rgba(255,187,0,.55)'; ctx.shadowBlur = W * 0.03;
    ctx.fillStyle = sc.kind === 'hook' ? '#fff' : '#FFBB00';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, yb + i * lh));
    ctx.shadowBlur = 0;
    if (sc.small) {
      const sa = ease((lt - 0.35) / 0.5); ctx.globalAlpha = sa * out;
      ctx.fillStyle = '#e8e8ec'; ctx.font = `600 ${W * 0.048}px ${FONT}`;
      wrapLines(ctx, sc.small, W * 0.8).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, yb + lines.length * lh + W * 0.06 + i * W * 0.064));
    }
    if (sc.kind === 'scene') { ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#FFBB00'; ctx.font = `700 ${W * 0.032}px ${FONT}`; ctx.fillText(`${String(idx).padStart(2, '0')} / ${String(scenes.length - 2).padStart(2, '0')}`, W / 2, H * 0.14); }
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  drawLogo(ctx, W * 0.1, H * 0.93, W * 0.07);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `700 ${W * 0.03}px ${FONT}`; ctx.fillText('STRIKE TECH LAB', W * 0.15, H * 0.94);
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, H - W * 0.012, W, W * 0.012);
  ctx.fillStyle = '#FFBB00'; ctx.fillRect(0, H - W * 0.012, W * Math.min(1, t / total), W * 0.012);
}
const REC_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
async function videoSheet(p) {
  await fontsReady();
  const W = 720, H = 1280, plan = buildScenes(p);
  const cv = h('canvas', { class: 'video-prev', width: W, height: H }); const ctx = cv.getContext('2d');
  const bar = h('i'), prog = h('div', { class: 'progress' }, bar);
  const result = h('div');
  let raf = 0, t0 = performance.now(), recording = false;
  const loop = (now) => { if (!cv.isConnected) return; const t = ((now - t0) / 1000) % plan.total; drawFrame(ctx, W, H, plan, t); bar.style.width = `${(t / plan.total) * 100}%`; raf = requestAnimationFrame(loop); };
  const mime = window.MediaRecorder ? REC_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) : null;
  const recBtn = h('button', { class: 'btn btn-gold btn-block', type: 'button', disabled: !mime || !cv.captureStream, text: mime ? `Nagraj film (${Math.round(plan.total)} s)` : 'Ta przeglądarka nie nagrywa wideo', onclick: async () => {
    if (recording) return; recording = true; busy(recBtn, true, 'Nagrywam – nie wyłączaj ekranu…'); result.replaceChildren();
    const stream = cv.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 }); const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    cancelAnimationFrame(raf); t0 = performance.now(); rec.start(250); raf = requestAnimationFrame(loop);
    await new Promise((r) => setTimeout(r, plan.total * 1000 + 150)); rec.stop(); await done;
    stream.getTracks().forEach((tr) => tr.stop());
    const type = mime.split(';')[0], blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob), ext = type === 'video/mp4' ? 'mp4' : 'webm';
    recording = false; busy(recBtn, false, 'Nagraj ponownie');
    result.replaceChildren(
      h('video', { class: 'video-prev', src: url, controls: true, playsinline: true }),
      ext === 'webm' && p.platform === 'instagram' ? h('p', { class: 'note-line err', text: 'Ta przeglądarka nagrała WebM – Instagram wymaga MP4. Nagraj w Chrome na Androidzie albo w Safari na iPhonie.' }) : null,
      h('div', { class: 'post-actions' },
        h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Podepnij do posta', onclick: async () => { sheet.close(); await attachMedia(p, new File([blob], `film.${ext}`, { type })); } }),
        h('a', { class: 'btn btn-ghost btn-sm', href: url, download: `STL-${slug(p.topic)}.${ext}`, text: '⬇ Pobierz' })),
      h('p', { class: 'hint', text: 'Muzykę z biblioteki TikToka/Instagrama dodasz w aplikacji przy publikacji.' }));
    vibrate(30);
  } });
  openSheet('Film z napisów', h('p', { class: 'hint', style: 'margin-top:0', text: `Podgląd na żywo: hook, ${plan.scenes.length - 2} scen i plansza końcowa. Napisy i lektor biorą się ze scenariusza – popraw je w poście, jeśli chcesz.` }),
    cv, prog, recBtn, result);
  raf = requestAnimationFrame(loop);
  sheet.addEventListener('close', () => cancelAnimationFrame(raf), { once: true });
}

/* ================================================================== na żywo + odznaki */
let channel = null; const seenPaid = new Set();
const liveReload = debounce(() => { reloadActive(); refreshBadges(); }, 600);
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('stl-centrum')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (m) => {
      const o = m.new || {};
      if (o.order_number && o.paid_at && Date.now() - new Date(o.paid_at) < 120000 && !seenPaid.has(o.id)) {
        seenPaid.add(o.id); toast('info', `💰 Nowe opłacone zlecenie ${o.order_number} – ${o.service_name}`, 9000); vibrate([30, 60, 30]);
      }
      if (['orders', 'finance', 'today'].includes(S.tab)) liveReload(); else refreshBadges();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_slots' }, () => { if (S.tab === 'calendar') liveReload(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_posts' }, () => { if (S.tab === 'social') liveReload(); else refreshBadges(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_agent_runs' }, (m) => {
      if (m.new?.status === 'OK') toast('ok', `Gotowe: ${m.new.posts_created} nowych propozycji do akceptacji.`, 8000);
      if (m.new?.status === 'ERROR') toast('err', `Generowanie nieudane: ${m.new.error || ''}`, 9000);
      if (S.tab === 'social') liveReload(); else refreshBadges();
    })
    .subscribe();
}
async function refreshBadges() {
  if (!session) return;
  const [o, p] = await Promise.all([
    sb.from('orders').select('id', { head: true, count: 'exact' }).eq('status', 'OPLACONE'),
    sb.from('ai_posts').select('id', { head: true, count: 'exact' }).eq('status', 'DO_AKCEPTACJI'),
  ]);
  const set = (el, n) => { el.textContent = n > 99 ? '99+' : String(n); el.classList.toggle('hidden', !n); };
  set($('#bOrders'), o.count || 0); set($('#bSocial'), p.count || 0);
  const total = (o.count || 0) + (p.count || 0);
  try { if (total) navigator.setAppBadge?.(total); else navigator.clearAppBadge?.(); } catch { /* */ }
}

/* ================================================================== instalacja PWA */
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').classList.remove('hidden'); });
$('#installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').classList.add('hidden'); });
addEventListener('appinstalled', () => { $('#installBtn').classList.add('hidden'); toast('ok', 'Centrum zainstalowane na ekranie głównym.'); });
function iosHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !store.get('stl_ios_hint')) { store.set('stl_ios_hint', true); toast('info', 'Aby zainstalować: Udostępnij → „Do ekranu początkowego”.', 12000); }
}

/* ================================================================== start */
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) { document.body.replaceChildren(h('p', { class: 'empty', text: 'Uzupełnij config.js (SUPABASE_URL i SUPABASE_KEY).' })); return; }
  let createClient;
  for (let i = 0; i < 4 && !createClient; i++) {
    try { ({ createClient } = await import(CFG.SUPABASE_JS)); } catch { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  if (!createClient) { document.body.replaceChildren(h('p', { class: 'empty', text: 'Brak połączenia. Odśwież, gdy wróci internet.' })); addEventListener('online', () => location.reload(), { once: true }); return; }
  sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'stl-centrum-auth' }, realtime: { params: { eventsPerSecond: 5 } } });
  const { data } = await sb.auth.getSession(); session = data.session;
  sb.auth.onAuthStateChange((event, s) => {
    const changed = (s?.user?.id || null) !== (session?.user?.id || null); session = s;
    if (changed || event === 'SIGNED_OUT') setTimeout(() => { S.loaded.clear(); showLoginOrApp(); }, 0);
  });
  await showLoginOrApp();
  iosHint();
}
boot().catch((e) => { console.error(e); toast('err', 'Błąd aplikacji. Odśwież stronę.'); });
