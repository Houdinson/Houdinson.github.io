/* =====================================================================
   STL Centrum – Social → „Treści” (v1)
   Biblioteka gotowych materiałów: każda zakładka = pakiet (rolki, grafiki, story, slajdy)
   z podpisem do skopiowania; pierwsza zakładka = plan publikacji.
   Dane: tabela content_packs (migracja v35), pliki: bucket social-media/tresci/<slug>/…
   Wgrywanie: zaznacz cały folder z eksportu (tresci.json + pliki) → „Wgraj treści”.
   Moduł nie zna sesji – dostaje klienta Supabase i pomocniki z social-hub.js (initTresci).
   Teksty wstawiane przez textContent (bez innerHTML).
   ===================================================================== */
const BUCKET = 'social-media';
const MEDIA = { 'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video', 'image/png': 'image', 'image/jpeg': 'image' };
const MAX_SIZE = 50 * 1024 * 1024;

let D = null;                       // zależności z social-hub.js
/** polska odmiana: 1 plik, 2 pliki, 5 plików, 22 pliki, 12 plików */
const pl = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const T = { packs: [], sel: null, loaded: false };

export function initTresci(deps) { D = deps; }

/* ------------------------------------------------------------------ Markdown planu (bez HTML) */
function inline(text) {
  const { h } = D, out = [];
  // **pogrubienie** i `kod`
  String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((part) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**')) out.push(h('b', { text: part.slice(2, -2) }));
    else if (part.startsWith('`') && part.endsWith('`')) out.push(h('code', { text: part.slice(1, -1) }));
    else out.push(document.createTextNode(part));
  });
  return out;
}
export function renderMarkdown(md) {
  const { h } = D, out = [], lines = String(md || '').split(/\r?\n/);
  for (let i = 0; i < lines.length;) {
    const ln = lines[i].trimEnd();
    if (ln.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      out.push(h('div', { class: 'tr-table' }, h('table', {},
        h('thead', {}, h('tr', {}, head.map((c) => h('th', {}, inline(c))))),
        h('tbody', {}, body.map((r) => h('tr', {}, r.map((c) => h('td', {}, inline(c)))))))));
      continue;
    }
    if (ln.startsWith('- ')) {
      const items = [];
      for (; i < lines.length && lines[i].startsWith('- '); i++) items.push(h('li', {}, inline(lines[i].slice(2))));
      out.push(h('ul', {}, items));
      continue;
    }
    const m = ln.match(/^(#{1,3}) (.*)/);
    if (m) out.push(h(`h${Math.min(m[1].length + 2, 5)}`, {}, inline(m[2])));
    else if (ln) out.push(h('p', {}, inline(ln)));
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------ odczyt i widok */
export async function loadTresci() {
  const { $, h, sb } = D;
  const box = $('#hubContent');
  if (!T.loaded) box.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const c = await sb();
  const { data, error } = await c.from('content_packs').select('*').order('sort').order('created_at');
  if (error) {
    box.replaceChildren(h('div', { class: 'empty', text: /content_packs/.test(error.message)
      ? 'Brak tabeli content_packs – uruchom w Supabase SQL Editor plik supabase/do-sql-editora/v35.sql.'
      : `Błąd: ${error.message}` }), uploadBar());
    return;
  }
  T.packs = data || []; T.loaded = true;
  if (!T.packs.some((p) => p.slug === T.sel)) T.sel = T.packs[0]?.slug || null;
  renderTresci();
}

function uploadBar() {
  const { h } = D;
  const input = h('input', { type: 'file', multiple: true, class: 'hidden', accept: '.json,application/json,video/mp4,video/quicktime,video/webm,image/png,image/jpeg' });
  const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '📦 Wgraj treści', onclick: () => input.click() });
  input.addEventListener('change', () => { if (input.files.length) importFiles(Array.from(input.files), btn).finally(() => { input.value = ''; }); });
  return h('div', { class: 'card tr-bar' },
    h('div', {}, h('b', { text: 'Biblioteka treści' }),
      h('p', { class: 'small muted', text: 'Zaznacz cały folder z eksportu (Ctrl+A): plik tresci.json i wszystkie filmy/grafiki. Pakiety o tej samej nazwie zostaną zastąpione.' })),
    input, btn);
}

function renderTresci() {
  const { $, h, put } = D;
  const box = $('#hubContent');
  if (!T.packs.length) {
    put(box, uploadBar(), h('div', { class: 'empty', text: 'Brak treści. Wgraj folder z eksportu przyciskiem „Wgraj treści”.' }));
    return;
  }
  const cur = T.packs.find((p) => p.slug === T.sel) || T.packs[0];
  const tabs = h('div', { class: 'chips tr-tabs', role: 'tablist', 'aria-label': 'Pakiety treści' },
    T.packs.map((p) => h('button', { class: 'chip', role: 'tab', type: 'button', 'aria-selected': String(p.slug === cur.slug),
      onclick: () => { T.sel = p.slug; D.vibrate?.(); renderTresci(); } },
    p.title, p.kind === 'pack' && p.files?.length ? h('span', { class: 'n', text: String(p.files.length) }) : null)));
  put(box, uploadBar(), tabs, cur.kind === 'plan' ? planPane(cur) : packPane(cur));
}

function planPane(p) {
  const { h } = D;
  return h('article', { class: 'card tr-plan' }, renderMarkdown(p.body), deleteBtn(p));
}

function packPane(p) {
  const { h, toast } = D;
  const media = (p.files || []).map((f) => h('figure', { class: 'tr-item' },
    f.type === 'video'
      ? h('video', { src: `${f.url}#t=1`, controls: true, playsinline: true, preload: 'metadata' })
      : h('img', { src: f.url, alt: f.name, loading: 'lazy' }),
    h('figcaption', {}, h('a', { class: 'gold', href: f.url, download: f.name.split('__').pop(), target: '_blank', rel: 'noopener', text: `⬇ ${f.name.split('__').pop()}` }))));
  const cap = h('textarea', { class: 'textarea tr-cap', readonly: true, 'aria-label': 'Podpis' }); cap.value = p.body || '';
  const copy = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: '📋 Kopiuj podpis', onclick: async () => {
    try { await navigator.clipboard.writeText(cap.value); toast('ok', 'Skopiowano podpis.'); D.vibrate?.(20); }
    catch { cap.select(); toast('err', 'Nie udało się skopiować – zaznaczyłem tekst, użyj Ctrl+C.'); }
  } });
  return h('div', {},
    media.length ? h('div', { class: 'tr-grid' }, media) : h('div', { class: 'empty', text: 'Ten pakiet nie ma plików.' }),
    p.body ? h('div', { class: 'card tr-capbox' }, h('div', { class: 'tr-caphead' }, h('b', { text: 'Podpis' }), copy), cap) : null,
    deleteBtn(p));
}

function deleteBtn(p) {
  const { h, toast, sb } = D;
  return h('div', { class: 'post-actions tr-del' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '🗑 Usuń zakładkę', onclick: async (e) => {
    if (!confirm(`Usunąć „${p.title}” razem z plikami?`)) return;
    D.busy(e.currentTarget, true, 'Usuwam…');
    const c = await sb();
    const paths = (p.files || []).map((f) => f.path).filter(Boolean);
    const { error } = await c.from('content_packs').delete().eq('id', p.id);
    if (error) { D.busy(e.currentTarget, false, '🗑 Usuń zakładkę'); return toast('err', `Nie usunięto: ${error.message}`); }
    if (paths.length) await c.storage.from(BUCKET).remove(paths);
    toast('ok', 'Usunięto.'); loadTresci();
  } }));
}

/* ------------------------------------------------------------------ import folderu */
/** Sprawdza manifest i pliki; zwraca { packs, byName } albo rzuca Error z komunikatem po polsku. */
export async function prepareImport(files) {
  const json = files.find((f) => /\.json$/i.test(f.name));
  if (!json) throw new Error('Brak pliku tresci.json – zaznacz cały folder z eksportu.');
  let man;
  try { man = JSON.parse(await json.text()); } catch { throw new Error(`${json.name}: to nie jest poprawny JSON.`); }
  const packs = Array.isArray(man) ? man : man.packs;
  if (!Array.isArray(packs) || !packs.length) throw new Error(`${json.name}: brak listy pakietów („packs”).`);
  const byName = new Map(files.filter((f) => f !== json).map((f) => [f.name.toLowerCase(), f]));
  const missing = [];
  packs.forEach((p, i) => {
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(p.slug || '')) throw new Error(`Pakiet ${i + 1}: niepoprawna nazwa „${p.slug}”.`);
    if (!String(p.title || '').trim()) throw new Error(`Pakiet ${p.slug}: brak tytułu.`);
    (p.files || []).forEach((n) => {
      const f = byName.get(String(n).toLowerCase());
      if (!f) missing.push(n);
      else if (!MEDIA[String(f.type).split(';')[0]]) throw new Error(`${f.name}: dozwolone MP4, MOV, WEBM, PNG, JPG.`);
      else if (f.size > MAX_SIZE) throw new Error(`${f.name}: plik większy niż 50 MB.`);
    });
  });
  if (missing.length) throw new Error(`Brakuje plików: ${missing.join(', ')}. Zaznacz cały folder (Ctrl+A).`);
  return { packs, byName };
}

async function importFiles(files, btn) {
  const { toast, sb, busy } = D;
  let plan;
  try { plan = await prepareImport(files); } catch (e) { return toast('err', e.message, 12000); }
  const c = await sb();
  const total = plan.packs.reduce((n, p) => n + (p.files || []).length, 0);
  let done = 0; const errs = [];
  for (const [i, p] of plan.packs.entries()) {
    const uploaded = [];
    let failed = false;
    for (const n of p.files || []) {
      const f = plan.byName.get(String(n).toLowerCase());
      busy(btn, true, `Wysyłam ${++done}/${total}…`);
      const type = String(f.type).split(';')[0];
      const safe = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      const path = `tresci/${p.slug}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const { error } = await c.storage.from(BUCKET).upload(path, f, { contentType: type, upsert: false });
      if (error) { errs.push(`${f.name}: ${error.message}`); failed = true; break; }
      const { data: pub } = c.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({ name: f.name, path, url: pub.publicUrl, type: MEDIA[type], size: f.size });
    }
    if (failed) { if (uploaded.length) await c.storage.from(BUCKET).remove(uploaded.map((u) => u.path)); continue; }
    const old = T.packs.find((x) => x.slug === p.slug);
    const row = { slug: p.slug, kind: p.kind === 'plan' ? 'plan' : 'pack', title: String(p.title).slice(0, 120),
      body: p.body ?? p.caption ?? null, files: uploaded, sort: Number.isFinite(p.sort) ? p.sort : (i + 1) * 10 };
    const { error } = await c.from('content_packs').upsert(row, { onConflict: 'slug' });
    if (error) { errs.push(`${p.title}: ${error.message}`); if (uploaded.length) await c.storage.from(BUCKET).remove(uploaded.map((u) => u.path)); continue; }
    const stale = (old?.files || []).map((f) => f.path).filter(Boolean);
    if (stale.length) await c.storage.from(BUCKET).remove(stale);
  }
  busy(btn, false, '📦 Wgraj treści');
  if (errs.length) toast('err', `Nie wgrano: ${errs.join('; ')}`, 0);
  else { toast('ok', `Wgrano: ${pl(plan.packs.length, 'zakładka', 'zakładki', 'zakładek')}, ${pl(total, 'plik', 'pliki', 'plików')}.`); D.vibrate?.(20); }
  T.sel = plan.packs[0]?.slug || T.sel;
  await loadTresci();
}
