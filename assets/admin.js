'use strict';
/* =====================================================================
   STRIKE TECH LAB – panel administratora (instrukcje, zamówienia, raporty, finanse, rachunki)
   Ładowany tylko po zalogowaniu administratora (assets/app.js → adminReady()).
   Korzysta ze wspólnych zmiennych i funkcji z assets/app.js. Dane chroni baza (RLS + 2FA),
   więc sam plik nie zawiera niczego tajnego.
   ===================================================================== */
/* ------------------------------------------------------------------ instrukcje serwisowe (tylko admin; treść w bazie: service_guides, migracja v8) */
const gd = { list: null, sel: '', edit: false, loading: false, err: '' };
const guideKey = (id) => `stl-guide-${id}`;
function guideChecks(id) { return new Set(store.get(guideKey(id), localStorage) || []); }
function saveGuideChecks(id, set) { set.size ? store.set(guideKey(id), [...set], localStorage) : store.del(guideKey(id), localStorage); }
async function loadGuides(force) {
  const out = $('#guidesOut'); if (!out || !isAdmin || !sb || gd.loading) return;
  if (gd.list && !force) { renderGuides(); return; }
  gd.loading = true; out.replaceChildren(h('p', { class: 'muted', text: 'Wczytuję instrukcje…' }));
  try {
    const r = await sb.from('service_guides').select('service_id,title,body,updated_at');
    if (r.error) { gd.err = /does not exist|schema cache|relation/i.test(r.error.message) ? 'missing' : r.error.message; gd.list = []; }
    else { gd.err = ''; const order = Object.keys(SVC); gd.list = (r.data || []).sort((a, b) => (order.indexOf(a.service_id) + 1 || 99) - (order.indexOf(b.service_id) + 1 || 99)); }
  } catch (e) { gd.err = String(e?.message || e); gd.list = []; }
  finally { gd.loading = false; }
  renderGuides();
}
/* Edycja w zwykłym tekście: "# Sekcja", "- Krok :: szczegóły", "! Krok z ostrzeżeniem :: szczegóły",
   pod krokiem opcjonalnie "  → ścieżka kliknięć" i "  @ programy" (klucze z listy, po przecinku). */
function guideToText(body) {
  return (body || []).map((s) => [`# ${s.t}`, ...(s.steps || []).flatMap((st) => [`${st.w ? '!' : '-'} ${st.t}${st.d ? ` :: ${st.d}` : ''}`,
    ...(st.k ? [`  → ${st.k}`] : []), ...(st.p?.length ? [`  @ ${st.p.join(', ')}`] : [])])].join('\n')).join('\n\n');
}
function textToGuide(txt) {
  const out = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (line.startsWith('#')) { out.push({ t: line.replace(/^#+\s*/, ''), steps: [] }); continue; }
    if (!out.length) out.push({ t: 'Kroki', steps: [] });
    const sec = out[out.length - 1];
    const last = sec.steps[sec.steps.length - 1];
    if (last && /^(→|->)/.test(line)) { last.k = line.replace(/^(→|->)\s*/, ''); continue; }
    if (last && line.startsWith('@')) { const p = line.slice(1).split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); if (p.length) last.p = p; continue; }
    const m = line.match(/^([-!*])\s*(.*)$/);
    if (m) { const [t, ...d] = m[2].split(' :: '); const st = { t: t.trim() }; if (d.length) st.d = d.join(' :: ').trim(); if (m[1] === '!') st.w = true; if (st.t) sec.steps.push(st); }
    else if (sec.steps.length) { const st = sec.steps[sec.steps.length - 1]; st.d = st.d ? `${st.d} ${line}` : line; }
    else sec.steps.push({ t: line });
  }
  return out.filter((s) => s.t || s.steps.length);
}
function updateGuideProgress() {
  const out = $('#guidesOut'); const all = $$('.guide-steps input', out), on = all.filter((x) => x.checked).length;
  const lbl = $('.guide-bar .muted', out); if (lbl) lbl.textContent = lbl.textContent.replace(/^\d+ z \d+/, `${on} z ${all.length}`);
  const bar = $('.guide-progress i', out); if (bar) bar.style.width = `${all.length ? Math.round(on / all.length * 100) : 0}%`;
  $$('.guide-sec', out).forEach((s) => { const x = $$('input', s); $('summary small', s).textContent = `${x.filter((i) => i.checked).length}/${x.length}`; });
  const clr = $('#guideClear', out); if (clr) clr.disabled = !on;
}
function renderGuides() {
  const out = $('#guidesOut'); if (!out) return;
  if (gd.err === 'missing') { out.replaceChildren(h('div', { class: 'banner info', text: 'Brak tabeli z instrukcjami w bazie. Uruchom w oknie do komend Supabase: npx supabase db push --linked (migracja v8), a potem odśwież stronę.' })); return; }
  if (gd.err) { out.replaceChildren(h('div', { class: 'banner err', text: `Nie udało się wczytać instrukcji: ${gd.err}` })); return; }
  if (!gd.list?.length) { out.replaceChildren(h('div', { class: 'banner info', text: 'Instrukcje widzi tylko administrator po logowaniu dwuetapowym. Wejdź w zakładkę Administracja, potwierdź kod z aplikacji i wróć tutaj.' }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Wczytaj ponownie', onclick: () => loadGuides(true) })); return; }
  if (!gd.list.some((g) => g.service_id === gd.sel)) gd.sel = gd.list[0].service_id;
  if (!REPmod) repModule().then(renderGuides).catch(() => {});   // nazwy i adresy programów
  const g = gd.list.find((x) => x.service_id === gd.sel);
  const checks = guideChecks(g.service_id);
  const total = (g.body || []).reduce((n, s) => n + (s.steps?.length || 0), 0);
  const done = [...checks].filter((k) => { const [i, j] = k.split('.').map(Number); return g.body?.[i]?.steps?.[j]; }).length;
  const pick = h('div', { class: 'prog-pick' }, h('label', { for: 'guideSvc', text: 'Usługa' }),
    h('select', { class: 'select', id: 'guideSvc', onchange: (e) => { gd.sel = e.target.value; gd.edit = false; renderGuides(); } },
      gd.list.map((x) => h('option', { value: x.service_id, selected: x.service_id === gd.sel, text: svcOf(x.service_id)?.name || nameOf(x.service_id) || x.service_id }))));
  const bar = h('div', { class: 'guide-bar' },
    h('div', { class: 'grow' }, h('b', { text: g.title }), h('div', { class: 'muted small', text: `${done} z ${total} kroków · zmieniono ${fmt(g.updated_at)}` }), h('div', { class: 'guide-progress', 'aria-hidden': 'true' }, h('i', { style: `width:${total ? Math.round(done / total * 100) : 0}%` }))),
    gd.edit ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', id: 'guideClear', text: 'Nowe zlecenie – wyczyść', disabled: !done, onclick: () => { saveGuideChecks(g.service_id, new Set()); renderGuides(); } }),
    gd.edit ? null : h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Pobierz PDF krok po kroku', onclick: async (e) => {
      const b = e.currentTarget; setBusy(b, true);
      try { const R = await repModule(); const pages = await R.renderGuide({ title: g.title, body: g.body || [], updated: fmt(g.updated_at, { dateStyle: 'medium' }) }); downloadBlob(R.toPdf(pages), `Instrukcja-${g.service_id}.pdf`); toast('ok', `PDF gotowy (${pages.length} str.).`); }
      catch (err) { toast('err', `Nie udało się utworzyć PDF: ${err.message}`); }
      setBusy(b, false, 'Pobierz PDF krok po kroku');
    } }),
    gd.edit ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Edytuj instrukcję', onclick: () => { gd.edit = true; renderGuides(); } }));
  if (gd.edit) {
    const title = h('input', { class: 'input', id: 'guideTitle', value: g.title, maxlength: '160' });
    const ta = h('textarea', { class: 'textarea guide-edit', id: 'guideText', spellcheck: 'true', 'aria-describedby': 'guideHelp' }); ta.value = guideToText(g.body);
    const save = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Zapisz', onclick: async () => {
      const body = textToGuide(ta.value);
      if (!body.length) { toast('err', 'Instrukcja jest pusta – dodaj co najmniej jedną sekcję z krokami.'); return; }
      save.disabled = true;
      const r = await sb.from('service_guides').update({ title: title.value.trim() || g.title, body, updated_at: new Date().toISOString() }).eq('service_id', g.service_id).select('service_id,title,body,updated_at');
      save.disabled = false;
      if (r.error || !r.data?.length) { toast('err', `Nie zapisano: ${r.error?.message || 'brak uprawnień (wymagane logowanie dwuetapowe)'}`); return; }
      Object.assign(g, r.data[0]); saveGuideChecks(g.service_id, new Set()); gd.edit = false; toast('ok', 'Instrukcja zapisana.'); renderGuides();
    } });
    out.replaceChildren(pick, bar, h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', { for: 'guideTitle', text: 'Tytuł' }), title),
      h('div', { class: 'field' }, h('label', { for: 'guideText', text: 'Kroki' }), ta,
        h('p', { class: 'muted small', id: 'guideHelp', text: 'Format: „# Nazwa sekcji”, „- Krok :: szczegóły”, „! Krok z ostrzeżeniem :: szczegóły”. Pod krokiem: „→ ścieżka kliknięć” i „@ programy” (np. @ hwinfo, occt). Linia bez znaku na początku dopisuje się do szczegółów poprzedniego kroku. Zapis czyści zaznaczenia na tej usłudze.' })),
      h('div', { class: 'row-actions', style: 'display:flex;gap:10px;flex-wrap:wrap' }, save, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Anuluj', onclick: () => { gd.edit = false; renderGuides(); } }))));
    return;
  }
  out.replaceChildren(pick, bar, ...(g.body || []).map((s, i) => {
    const n = s.steps?.length || 0, d = (s.steps || []).filter((_, j) => checks.has(`${i}.${j}`)).length;
    return h('details', { class: 'guide-sec', open: d < n },
      h('summary', {}, h('span', { text: s.t }), h('small', { text: `${d}/${n}` })),
      h('ol', { class: 'guide-steps' }, (s.steps || []).map((st, j) => {
        const key = `${i}.${j}`, on = checks.has(key);
        // bez przerysowania całej listy – fokus klawiatury zostaje na polu
        const cb = h('input', { type: 'checkbox', checked: on, onchange: (e) => { const c = guideChecks(g.service_id); e.target.checked ? c.add(key) : c.delete(key); saveGuideChecks(g.service_id, c); e.target.closest('li').classList.toggle('done', e.target.checked); updateGuideProgress(); } });
        const progs = (st.p || []).map((k) => REPmod?.PROGRAMS?.[k]).filter(Boolean);
        return h('li', { class: `${st.w ? 'warn' : ''}${on ? ' done' : ''}` }, h('label', {}, cb, h('span', {}, h('b', { text: st.t }), st.d ? h('span', { class: 'gd', text: st.d }) : null)),
          st.k ? h('div', { class: 'gk' }, h('span', { class: 'gk-l', text: 'Kliknij' }), h('code', { text: st.k })) : null,
          progs.length ? h('div', { class: 'gp' }, progs.map(([nm, why, url]) => url ? h('a', { class: 'pill ghost', href: url, target: '_blank', rel: 'noopener noreferrer', title: why, text: nm }) : h('span', { class: 'pill ghost', title: why, text: nm }))) : null);
      })));
  }));
}

/* ------------------------------------------------------------------ raport STRIKE PROOF w panelu admina (edytor) */
function reportEditor(o) {
  const box = h('div', { class: 'rep-ed' }, h('p', { class: 'muted small', text: 'Wczytuję szablon raportu…' }));
  (async () => {
    let R;
    try { R = await repModule(); } catch { box.replaceChildren(h('div', { class: 'banner err', text: 'Nie udało się wczytać generatora raportów (plik stl-report.js). Odśwież stronę.' })); return; }
    const tpl = R.templateFor(o.service_id, o.config?.extras);
    const before = (o.order_results || []).find((r) => r.phase === 'before')?.metrics || {};
    const after = (o.order_results || []).find((r) => r.phase === 'after')?.metrics || {};
    let saved = {}, hasFacts = true;
    let r = await sb.from('order_reports').select('works,recommendations,facts').eq('order_id', o.id).maybeSingle();
    if (r.error && /facts/.test(r.error.message)) { hasFacts = false; r = await sb.from('order_reports').select('works,recommendations').eq('order_id', o.id).maybeSingle(); }
    if (!r.error && r.data) saved = r.data;
    const facts0 = saved.facts || {};
    const uid = `rep-${o.id.slice(0, 8)}`;
    // --- sprzęt i ustawienia
    const factIn = {};
    const factsBox = h('div', { class: 'rep-facts' }, tpl.facts.map((f) => {
      const id = `${uid}-f-${f.k}`;
      const el = f.long ? h('textarea', { class: 'textarea', id, rows: 2, maxlength: 1000, placeholder: f.ph || '' }) : h('input', { class: 'input', id, maxlength: 200, placeholder: f.ph || '' });
      el.value = facts0[f.k] ?? ''; factIn[f.k] = el;
      return h('div', { class: `field${f.long ? ' wide' : ''}` }, h('label', { for: id, text: f.l }), el);
    }));
    // --- pomiary
    const rowsBox = h('div', { class: 'rep-groups' });
    const mIn = [];   // { key, label?, b, a, one }
    const vStr = (v) => v === undefined || v === null ? '' : String(v).replace(/^(-?\d+)\.(\d+)$/, '$1,$2');
    for (const g of tpl.groups) {
      const tb = h('tbody');
      for (const [k, l, u] of g.m) {
        const b = g.one ? null : h('input', { class: 'input', inputmode: 'decimal', 'aria-label': `${l} – przed`, value: vStr(before[k]) });
        const a = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': `${l} – ${g.one ? 'wynik' : 'po'}`, value: vStr(after[k]) });
        mIn.push({ key: k, b, a, one: !!g.one });
        tb.append(h('tr', {}, h('th', { scope: 'row' }, l, u ? h('span', { class: 'muted', text: ` (${u})` }) : null), g.one ? h('td', { colspan: 2 }, a) : [h('td', {}, b), h('td', {}, a)]));
      }
      rowsBox.append(h('h5', { text: g.t }), h('table', { class: 'rep-tbl' }, h('thead', {}, h('tr', {}, h('th', { text: 'Pomiar' }), g.one ? h('th', { colspan: 2, text: 'Wynik' }) : [h('th', { text: 'Przed' }), h('th', { text: 'Po' })])), tb));
    }
    // własne pomiary (spoza szablonu) – także te zapisane wcześniej
    const known = new Set(tpl.groups.flatMap((g) => g.m.map(([k]) => k)));
    const extraTb = h('tbody');
    const addExtra = (k = '', label = '') => {
      const name = h('input', { class: 'input', placeholder: 'Nazwa, np. Cinebench R23', 'aria-label': 'Nazwa pomiaru', value: label || (k ? R.metricInfo(k).l : '') });
      const b = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': 'Przed', value: vStr(before[k]) }), a = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': 'Po', value: vStr(after[k]) });
      const row = { key: k, name, b, a, one: false }; mIn.push(row);
      const tr = h('tr', {}, h('th', {}, name), h('td', {}, b), h('td', {}, a, h('button', { class: 'x-btn', type: 'button', 'aria-label': 'Usuń pomiar', text: '×', onclick: () => { tr.remove(); mIn.splice(mIn.indexOf(row), 1); } })));
      extraTb.append(tr); return name;
    };
    [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !known.has(k)).forEach((k) => addExtra(k, facts0._labels?.[k]));
    rowsBox.append(h('h5', { text: 'Własne pomiary' }), h('table', { class: 'rep-tbl' }, extraTb),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Dodaj pomiar', onclick: () => addExtra().focus() }));
    // --- prace i zalecenia: lista z szablonu (zaznacz wykonane) + własne linie
    const checkList = (items, savedTxt, label) => {
      const lines = String(savedTxt || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const boxes = items.map((t) => ({ t, cb: h('input', { type: 'checkbox', checked: lines.length ? lines.includes(t) : true }) }));
      const other = h('textarea', { class: 'textarea', rows: 2, maxlength: 2000, placeholder: `${label} spoza listy – jedna w linii` });
      other.value = lines.filter((l) => !items.includes(l)).join('\n');
      return { el: h('div', {}, h('div', { class: 'rep-checks' }, boxes.map((x) => h('label', { class: 'check' }, x.cb, h('span', { text: x.t })))), other),
        value: () => [...boxes.filter((x) => x.cb.checked).map((x) => x.t), ...other.value.split('\n').map((s) => s.trim()).filter(Boolean)] };
    };
    const works = checkList(tpl.works, saved.works, 'Prace'), recs = checkList(tpl.recs, saved.recommendations, 'Zalecenia');
    const prev = h('div', { class: 'rep-prev', 'aria-live': 'polite' });
    // --- zbieranie i zapis
    const collect = () => {
      const mb = {}, ma = {}, labels = { ...(facts0._labels || {}) };
      for (const x of mIn) {
        let k = x.key;
        if (x.name) { const nm = x.name.value.trim(); if (!nm) continue; k = x.key || R.slug(nm); if (!k) continue; labels[k] = nm.slice(0, 60); }   // istniejący pomiar zachowuje klucz
        const vb = x.b ? R.parseVal(x.b.value) : undefined, va = R.parseVal(x.a.value);
        if (vb !== undefined) mb[k] = vb; if (va !== undefined) ma[k] = va;
      }
      const facts = {};
      for (const [k, el] of Object.entries(factIn)) { const v = el.value.trim(); if (v) facts[k] = v.slice(0, 1000); }
      const used = new Set([...Object.keys(mb), ...Object.keys(ma)]);
      const lab = Object.fromEntries(Object.entries(labels).filter(([k]) => used.has(k)));
      if (Object.keys(lab).length) facts._labels = lab;
      return { mb, ma, facts, works: works.value(), recs: recs.value() };
    };
    const save = async (d) => {
      await callFn('admin', { action: 'save_results', order_id: o.id, phase: 'before', metrics: d.mb });
      await callFn('admin', { action: 'save_results', order_id: o.id, phase: 'after', metrics: d.ma });
      const row = { order_id: o.id, works: d.works.join('\n').slice(0, 4000) || null, recommendations: d.recs.join('\n').slice(0, 2000) || null };
      let e = hasFacts ? (await sb.from('order_reports').upsert({ ...row, facts: d.facts })).error : null;
      if (!hasFacts || (e && /facts/.test(e.message))) { e = (await sb.from('order_reports').upsert(row)).error; if (!e) toast('err', 'Dane sprzętu nie zostały zapisane w bazie – uruchom npx supabase db push --linked (migracja v9). Raport PDF i tak je zawiera.', 9000); }
      if (e) throw new Error(`Nie zapisano opisu raportu: ${e.message}`);
      o.order_results = [{ phase: 'before', metrics: d.mb }, { phase: 'after', metrics: d.ma }];
    };
    const build = async (d) => R.renderReport({ order: { order_number: o.order_number, service_name: o.service_name, client: o.customer?.company || o.customer?.name || o.profiles?.full_name }, tpl, before: d.mb, after: d.ma, facts: d.facts, works: d.works, recs: d.recs });
    const showPrev = (pages, extra) => prev.replaceChildren(h('div', { class: 'rep-pages' }, pages.map((p, i) => h('img', { src: p.preview, alt: `Podgląd raportu – strona ${i + 1}`, loading: 'lazy' }))), extra || '');
    const empty = (d) => !Object.keys(d.mb).length && !Object.keys(d.ma).length && !Object.keys(d.facts).length;
    const bSave = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zapisz dane', onclick: async () => {
      const d = collect(); setBusy(bSave, true);
      try { await save(d); toast('ok', 'Dane raportu zapisane. Klient widzi pomiary w Strefie Klienta.'); } catch (e) { toast('err', e.message); }
      setBusy(bSave, false, 'Zapisz dane');
    } });
    const bPrev = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Podgląd', onclick: async () => {
      const d = collect(); if (empty(d)) return toast('err', 'Wpisz przynajmniej jeden pomiar albo dane sprzętu.');
      setBusy(bPrev, true); try { showPrev(await build(d)); prev.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { toast('err', `Podgląd nie powstał: ${e.message}`); } setBusy(bPrev, false, 'Podgląd');
    } });
    const bPdf = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: o.user_id ? 'Utwórz raport PDF i udostępnij klientowi' : 'Utwórz raport PDF', onclick: async () => {
      const d = collect(); if (empty(d)) return toast('err', 'Wpisz przynajmniej jeden pomiar albo dane sprzętu.');
      setBusy(bPdf, true);
      try {
        await save(d);
        const pages = await build(d), pdf = R.toPdf(pages), name = `STRIKE-PROOF-${o.order_number || 'raport'}.pdf`;
        let shared = false;
        if (o.user_id) {
          const { error } = await sb.storage.from('reports').upload(`${o.user_id}/${o.id}/${Date.now()}-${name}`, pdf, { contentType: 'application/pdf', upsert: false });
          if (error) throw new Error(`PDF powstał, ale nie udało się go wgrać: ${error.message}`);
          shared = true; const files = box.closest('.adm-detail')?.querySelector('.files'); if (files) loadFiles(o, files, o.user_id);
        }
        showPrev(pages, h('div', { class: 'cta-row', style: 'margin-top:10px' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Pobierz PDF', onclick: () => downloadBlob(pdf, name) }),
          shared && !['TESTY', 'ZAKONCZONE'].includes(o.status) ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zmień status na „Testy i raport”', onclick: async (e) => {
            const b = e.currentTarget; setBusy(b, true);
            try { await callFn('admin', { action: 'set_status', order_id: o.id, status: 'TESTY', note: 'Raport STRIKE PROOF gotowy' }); toast('ok', 'Status zmieniony – klient dostał powiadomienie.'); await loadAdmin(true); } catch (err) { toast('err', err.message); setBusy(b, false, 'Zmień status na „Testy i raport”'); }
          } }) : null));
        toast('ok', shared ? 'Raport PDF zapisany – klient pobierze go w Strefie Klienta.' : 'Raport PDF gotowy do pobrania.', 7000);
      } catch (e) { toast('err', e.message); }
      setBusy(bPdf, false, o.user_id ? 'Utwórz raport PDF i udostępnij klientowi' : 'Utwórz raport PDF');
    } });
    box.replaceChildren(
      h('p', { class: 'rep-tpl' }, 'Szablon: ', h('b', { text: tpl.title })),
      h('details', { class: 'rep-sec', open: true }, h('summary', { text: 'Sprzęt i ustawienia' }), factsBox),
      h('details', { class: 'rep-sec', open: true }, h('summary', { text: 'Pomiary' }), h('p', { class: 'muted small', text: 'Liczby z przecinkiem lub kropką. Puste pola nie trafiają do raportu. Zielona zmiana w raporcie = poprawa.' }), rowsBox),
      h('details', { class: 'rep-sec' }, h('summary', { text: `Wykonane prace (${tpl.works.length})` }), works.el),
      h('details', { class: 'rep-sec' }, h('summary', { text: `Zalecenia dla klienta (${tpl.recs.length})` }), recs.el),
      h('div', { class: 'cta-row', style: 'margin:12px 0 0' }, bPdf, bPrev, bSave), prev);
  })();
  return box;
}

/* ------------------------------------------------------------------ administracja */
let adm = { orders: [], sel: null, filter: '', q: '', loading: false };
/* Panel administracji wymaga logowania dwuetapowego (TOTP). Baza też to sprawdza (is_admin() wymaga aal2). */
async function adminMfaOk(silent) {
  const box = $('#adminOut');
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (lvl?.currentLevel === 'aal2') return true;
  if (silent && box.querySelector('[data-mfa]')) return false;          // nie kasuj wpisywanego kodu przy odświeżaniu
  const { data: f } = await sb.auth.mfa.listFactors();
  box.replaceChildren(mfaCard((f?.totp || []).find((x) => x.status === 'verified')));
  return false;
}
function mfaCard(factor) {
  const code = h('input', { class: 'input', id: 'mfaCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, 'aria-describedby': 'mfaMsg' });
  const msg = h('div', { class: 'form-msg', id: 'mfaMsg', role: 'status', 'aria-live': 'polite' });
  const lbl = h('label', { for: 'mfaCode', text: 'Kod z aplikacji (6 cyfr)' });
  const fail = (t) => { msg.className = 'form-msg err'; msg.textContent = t; code.setAttribute('aria-invalid', 'true'); code.focus(); };
  const verify = async (factorId, btn) => {
    const v = code.value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(v)) return fail('Wpisz 6 cyfr z aplikacji.');
    setBusy(btn, true);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: v });
    setBusy(btn, false, btn.dataset.label);
    if (error) return fail('Kod jest nieprawidłowy albo wygasł. Wpisz nowy kod z aplikacji.');
    toast('ok', 'Logowanie dwuetapowe potwierdzone.'); adm.loading = false; loadAdmin();
  };
  if (factor) {
    const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: 'Potwierdź kod' });
    setTimeout(() => code.focus(), 50);
    return h('form', { class: 'card hud', style: 'max-width:460px', dataset: { mfa: '1' }, onsubmit: (e) => { e.preventDefault(); verify(factor.id, btn); } },
      h('h3', { text: 'Potwierdź, że to Ty' }), h('p', { class: 'muted', text: 'Panel administracji wymaga logowania dwuetapowego. Wpisz aktualny kod z aplikacji uwierzytelniającej.' }),
      h('div', { class: 'field' }, lbl, code), btn, msg);
  }
  const step = h('div');
  const start = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Włącz logowanie dwuetapowe', onclick: async (e) => {
    const b = e.currentTarget; setBusy(b, true);
    const { data: f } = await sb.auth.mfa.listFactors();
    for (const x of (f?.all || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Strike Tech Lab ${new Date().toISOString().slice(0, 16)}` });
    setBusy(b, false, 'Włącz logowanie dwuetapowe');
    if (error) { msg.className = 'form-msg err'; msg.textContent = `Nie udało się włączyć 2FA: ${error.message}. Sprawdź, czy w Supabase jest włączone MFA (TOTP).`; return; }
    const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: 'Potwierdź i włącz' });
    step.replaceChildren(h('form', { onsubmit: (ev) => { ev.preventDefault(); verify(data.id, btn); } },
      h('ol', { class: 'measure-list' }, h('li', { text: 'Zainstaluj aplikację uwierzytelniającą, np. Google Authenticator, Microsoft Authenticator albo Aegis.' }), h('li', { text: 'Zeskanuj kod QR albo wpisz klucz ręcznie.' }), h('li', { text: 'Wpisz 6-cyfrowy kod, który pokaże aplikacja.' })),
      h('img', { src: data.totp.qr_code, alt: 'Kod QR do dodania konta Strike Tech Lab w aplikacji uwierzytelniającej', width: 180, height: 180, style: 'background:#fff;padding:8px;border-radius:10px;margin:14px 0' }),
      h('p', { class: 'small' }, 'Klucz do wpisania ręcznie: ', h('code', { text: data.totp.secret })),
      h('div', { class: 'field' }, lbl, code), btn));
    setTimeout(() => code.focus(), 50);
  } });
  step.append(start);
  return h('div', { class: 'card hud', style: 'max-width:520px', dataset: { mfa: '1' } }, h('h3', { text: 'Włącz logowanie dwuetapowe (2FA)' }),
    h('p', { class: 'muted', text: 'Panel administracji daje dostęp do danych wszystkich klientów, dlatego oprócz hasła wymaga kodu z aplikacji na telefonie. Bez tego nawet przejęte hasło nie wystarczy do wejścia.' }), step, msg);
}
async function loadAdmin(silent = false) {
  if (!isAdmin || adm.loading) return;
  if (!(await adminMfaOk(silent))) return;
  adm.loading = true;
  const box = $('#adminOut'); if (!silent && !box.childElementCount) box.replaceChildren(h('p', { class: 'muted', text: 'Ładuję zamówienia…' }));
  let q = sb.from('orders').select(cat.hasV2 ? 'id,order_number,status,service_id,config,service_name,express,total_grosze,amount_due_grosze,created_at,paid_at,customer,slot_conflict,user_id,handover,city,customer_note,consents,spec,discount_code,referral_code_used,profiles(email,full_name,phone),calendar_slots(starts_at,ends_at,status),order_events(status,note,at),order_results(phase,metrics)' : 'id,order_number,status,service_name,total_grosze,amount_due_grosze,created_at,paid_at,slot_conflict,user_id,customer_note,profiles(email,full_name,phone),calendar_slots(starts_at,ends_at,status)')
    .order('created_at', { ascending: false }).limit(200);
  if (adm.filter) q = q.eq('status', adm.filter);
  let { data, error } = await q;
  if (!error && cat.hasV2 && adm.v10 !== false) {
    const ids = (data || []).filter((o) => o.paid_at).map((o) => o.id);
    const p = ids.length ? await sb.from('orders').select('id,pay_method,stripe_fee_grosze,refund_grosze,refunded_at').in('id', ids) : { data: [] };
    if (p.error) adm.v10 = !/column/i.test(p.error.message);
    else { adm.v10 = true; const m = new Map(p.data.map((x) => [x.id, x])); data = data.map((o) => ({ ...o, ...(m.get(o.id) || {}) })); }
  }
  adm.loading = false;
  if (error) { box.replaceChildren(h('div', { class: 'banner err', text: `Błąd: ${error.message}` })); return; }
  adm.orders = data; renderAdmin();
}
function renderAdmin() {
  const box = $('#adminOut');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj: numer, klient, e-mail', 'aria-label': 'Szukaj zamówień', value: adm.q, oninput: debounce((e) => { adm.q = e.target.value.toLowerCase(); renderAdmin(); setTimeout(() => $('#adminOut input[type=search]')?.focus(), 0); }, 250) });
  const filter = h('select', { class: 'select', 'aria-label': 'Filtr statusu', onchange: (e) => { adm.filter = e.target.value; loadAdmin(); } }, h('option', { value: '', text: 'Wszystkie statusy' }), Object.entries(STATUS).map(([k, [t]]) => h('option', { value: k, text: t, selected: k === adm.filter })));
  const list = adm.orders.filter((o) => !adm.q || [o.order_number, o.service_name, o.profiles?.email, o.profiles?.full_name, o.customer?.name, o.customer?.company].join(' ').toLowerCase().includes(adm.q));
  const tools = h('div', { class: 'toolbar' }, filter, search,
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Odśwież zamówienia', onclick: () => loadAdmin() }),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Eksport CSV', onclick: async (e) => { const b = e.currentTarget; setBusy(b, true); try { const d = await callFn('admin', { action: 'export_csv' }); download(`zamowienia-${todayKey()}.csv`, d.csv, 'text/csv;charset=utf-8'); } catch (err) { toast('err', err.message); } setBusy(b, false, 'Eksport CSV'); } }),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Finanse i arkusz', onclick: () => showTab('finance') }));
  const table = h('div', { class: 'scroll-x' }, h('table', { class: 'adm' },
    h('thead', {}, h('tr', {}, ['Numer / data', 'Klient', 'Pozycja', 'Termin', 'Status', 'Kwota'].map((t) => h('th', { text: t })))),
    h('tbody', {}, list.length ? list.map((o) => {
      const s = o.calendar_slots?.[0], [lbl, tone] = STATUS[o.status] || [o.status, ''];
      return h('tr', { class: adm.sel === o.id ? 'sel' : '', tabindex: 0, onclick: () => { adm.sel = adm.sel === o.id ? null : o.id; renderAdmin(); }, onkeydown: (e) => { if (e.key === 'Enter') { adm.sel = adm.sel === o.id ? null : o.id; renderAdmin(); } } },
        h('td', {}, h('b', { class: 'gold', text: o.order_number || '—' }), h('br'), h('span', { class: 'muted small', text: fmt(o.created_at) })),
        h('td', {}, o.customer?.name || o.profiles?.full_name || '–', h('br'), h('span', { class: 'muted small', text: o.profiles?.email || o.customer?.email || '' })),
        h('td', { text: o.service_name + (o.express ? ' + Express' : '') }),
        h('td', { text: s ? `${fmt(s.starts_at, { day: 'numeric', month: 'short' })} ${hm(s.starts_at)}` : '–' }),
        h('td', {}, h('span', { class: `pill ${tone}`, text: lbl }), o.slot_conflict ? h('span', { class: 'pill bad', text: 'konflikt' }) : null),
        h('td', { text: o.amount_due_grosze < o.total_grosze ? `${zl(o.amount_due_grosze)} / ${zl(o.total_grosze)}` : zl(o.total_grosze) }));
    }) : h('tr', {}, h('td', { colspan: 6, class: 'muted', text: 'Brak zamówień.' })))));
  const sel = adm.orders.find((o) => o.id === adm.sel);
  box.replaceChildren(tools, table, sel ? adminDetail(sel) : '', adminForms());
  if (sel) setTimeout(() => $('#admDetail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  loadInquiries(); loadAdminReviews();
}
function adminDetail(o) {
  const c = o.customer || {};
  const status = h('select', { class: 'select' }, ['W_REALIZACJI', 'TESTY', 'ZAKONCZONE', 'ANULOWANE'].map((k) => h('option', { value: k, text: STATUS[k][0], selected: k === o.status })));
  const note = h('input', { class: 'input', maxlength: 500, placeholder: 'Notatka dla klienta (widoczna w historii)' });
  const files = h('div', { class: 'files' }); if (o.user_id) loadFiles(o, files, o.user_id);
  const fileIn = h('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.txt,.log,.csv,.json', class: 'input', style: 'padding:9px' });
  const act = async (btn, label, body, ok) => { setBusy(btn, true); try { const d = await callFn('admin', body); toast('ok', ok(d)); await loadAdmin(true); } catch (e) { toast('err', e.message); } setBusy(btn, false, label); };
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', log: 'text/plain', csv: 'text/csv', json: 'application/json' };
  return h('div', { class: 'adm-detail', id: 'admDetail' },
    h('div', { class: 'order-h' }, h('h3', { style: 'margin:0', text: `${o.order_number || 'Nieopłacone'} · ${o.service_name}` }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zamknij szczegóły', onclick: () => { adm.sel = null; renderAdmin(); } })),
    h('div', { class: 'kv' },
      h('div', {}, h('small', { text: 'Klient' }), `${c.name || o.profiles?.full_name || '–'}`, h('br'), o.profiles?.email || c.email || '', h('br'), c.phone || o.profiles?.phone || ''),
      h('div', {}, h('small', { text: 'Typ' }), c.type === 'business' ? `Firma: ${c.company || ''}, NIP ${c.nip || ''}` : 'Konsument'),
      h('div', {}, h('small', { text: 'Przekazanie' }), o.handover ? `${o.handover === 'courier' ? 'Kurier' : 'Osobiście'}${o.city ? `, ${o.city}` : ''}` : '–'),
      h('div', {}, h('small', { text: 'Kod' }), o.discount_code || o.referral_code_used || '–'),
      h('div', {}, h('small', { text: 'Zgody' }), o.consents?.at ? `${Object.entries({ terms: 'Regulamin', privacy: 'RODO', withdrawal: 'pouczenie o odstąpieniu', earlyStart: 'start przed 14 dniami', marketing: 'marketing' }).filter(([k]) => o.consents[k]).map(([, v]) => v).join(', ')} (${fmt(o.consents.at)})` : '–')),
    clientContact(o.user_id),
    o.customer_note ? h('p', {}, h('b', { text: 'Uwagi klienta: ' }), o.customer_note) : null,
    Object.keys(o.spec || {}).length ? h('ul', { class: 'sum-spec' }, Object.entries(o.spec).map(([k, v]) => h('li', { text: `${k}: ${v}` }))) : null,
    h('div', { class: 'grid g2', style: 'margin-top:16px' },
      h('div', {}, h('h4', { text: 'Status' }), h('div', { class: 'field' }, status), h('div', { class: 'field' }, note),
        h('div', { class: 'cta-row', style: 'margin:0' },
          h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Zmień status', onclick: (e) => act(e.currentTarget, 'Zmień status', { action: 'set_status', order_id: o.id, status: status.value, note: note.value }, () => 'Status zmieniony. Klient widzi go od razu (przy „Testy” i „Zakończone” dostaje maila).') }),
          !o.order_number && o.status !== 'ANULOWANE' ? [['gotowka', 'Opłacone gotówką'], ['przelew', 'Opłacone przelewem']].map(([m, t]) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t, onclick: (e) => { if (confirm(`Potwierdzasz wpłatę ${zl(o.amount_due_grosze)} poza Stripe (${m === 'gotowka' ? 'gotówka' : 'przelew'})?`)) act(e.currentTarget, t, { action: 'mark_paid', order_id: o.id, method: m }, (d) => `Opłacone: ${d.order_number}`); } })) : null),
        paymentBox(o),
        o.order_number ? orderBills(o) : null,
        o.order_events?.length ? h('ul', { class: 'timeline', style: 'margin-top:14px' }, [...o.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((ev) => h('li', {}, h('time', { text: fmt(ev.at) }), (STATUS[ev.status]?.[0] || ev.status) + (ev.note ? ` – ${ev.note}` : '')))) : null),
      h('div', {}, h('h4', { text: 'Raport STRIKE PROOF' }),
        cat.hasV2 ? reportEditor(o) : h('p', { class: 'note', text: 'Raporty wymagają migracji v2 w bazie.' }),
        h('h4', { style: 'margin-top:16px', text: 'Pliki (PDF, zdjęcia, logi – maks. 10 MB)' }), files,
        o.user_id ? h('div', { class: 'code-row', style: 'margin-top:8px' }, fileIn, h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Wgraj plik', onclick: async (e) => {
          const f = fileIn.files[0]; if (!f) return toast('err', 'Wybierz plik.');
          const ext = (f.name.split('.').pop() || '').toLowerCase(); if (!MIME[ext]) return toast('err', 'Dozwolone: PDF, PNG, JPG, TXT, LOG, CSV, JSON.');
          if (f.size > 10 * 1024 * 1024) return toast('err', 'Plik jest większy niż 10 MB.');
          const b = e.currentTarget; setBusy(b, true);
          const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(-90);
          const { error } = await sb.storage.from('reports').upload(`${o.user_id}/${o.id}/${Date.now()}-${safe}`, f, { contentType: MIME[ext], upsert: false });
          setBusy(b, false, 'Wgraj plik');
          if (error) return toast('err', `Nie udało się wgrać: ${error.message}`);
          fileIn.value = ''; toast('ok', 'Plik wgrany – klient może go pobrać.'); loadFiles(o, files, o.user_id);
        } })) : h('p', { class: 'note', text: 'Konto klienta usunięte – nie można dodać plików.' }))));
}
function adminForms() {
  const dCode = h('input', { class: 'input', placeholder: 'KOD (np. JESIEN15)', maxlength: 40 }), dPct = h('input', { class: 'input', type: 'number', min: 1, max: 50, placeholder: '%' });
  const dCap = h('input', { class: 'input', type: 'number', min: 1, placeholder: 'maks. zł (opcj.)' }), dUses = h('input', { class: 'input', type: 'number', min: 1, placeholder: 'limit użyć (opcj.)' });
  const dTo = h('input', { class: 'input', type: 'date' }), dSvc = h('input', { type: 'checkbox' });
  const bDate = h('input', { class: 'input', type: 'date', min: todayKey() }), bFrom = h('input', { class: 'input', type: 'time', value: '10:00', step: 3600 }), bTo = h('input', { class: 'input', type: 'time', value: '20:00', step: 3600 }), bWhy = h('input', { class: 'input', placeholder: 'Powód (np. urlop)', maxlength: 100 });
  return h('div', { class: 'grid g2', style: 'margin-top:26px' },
    h('div', { class: 'card' }, h('h3', { text: 'Nowy kod rabatowy' }),
      h('div', { class: 'row2' }, h('div', { class: 'field' }, dCode), h('div', { class: 'field' }, dPct)), h('div', { class: 'row2' }, h('div', { class: 'field' }, dCap), h('div', { class: 'field' }, dUses)),
      h('div', { class: 'field' }, h('label', { text: 'Ważny do (opcjonalnie)' }), dTo), h('label', { class: 'check' }, dSvc, h('span', { text: 'Tylko usługi (bez zestawów PC)' })),
      h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Utwórz kod', onclick: async (e) => { const b = e.currentTarget; setBusy(b, true); try { const d = await callFn('admin', { action: 'create_discount', code: dCode.value, pct: +dPct.value, cap_zl: dCap.value ? +dCap.value : undefined, max_uses: dUses.value ? +dUses.value : undefined, valid_to: dTo.value || undefined, services_only: dSvc.checked }); toast('ok', `Kod ${d.code} utworzony.`); dCode.value = ''; } catch (err) { toast('err', err.message); } setBusy(b, false, 'Utwórz kod'); } })),
    h('div', { class: 'card' }, h('h3', { text: 'Blokada kalendarza (urlop, przerwa)' }),
      h('div', { class: 'field' }, h('label', { text: 'Dzień' }), bDate), h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Od' }), bFrom), h('div', { class: 'field' }, h('label', { text: 'Do' }), bTo)), h('div', { class: 'field' }, bWhy),
      h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Zablokuj termin', onclick: async (e) => { if (!bDate.value) return toast('err', 'Wybierz dzień.'); const b = e.currentTarget; setBusy(b, true); try { await callFn('admin', { action: 'block', date: bDate.value, from: bFrom.value, to: bTo.value, reason: bWhy.value }); toast('ok', 'Termin zablokowany – zniknął z kalendarza.'); loadSlots(true); } catch (err) { toast('err', err.message); } setBusy(b, false, 'Zablokuj termin'); } })),
    h('div', { class: 'card', style: 'grid-column:1/-1' }, h('h3', { text: 'Wiadomości i zapytania o wycenę' }), h('div', { id: 'inqOut', class: 'muted', text: 'Ładuję…' })),
    h('div', { class: 'card', style: 'grid-column:1/-1' }, h('h3', { text: 'Opinie klientów' }), h('div', { id: 'revAdmOut', class: 'muted', text: 'Ładuję…' })));
}
async function loadInquiries() {
  if (!cat.hasV2) { const b = $('#inqOut'); if (b) b.textContent = 'Wymaga migracji v2.'; return; }
  const { data, error } = await sb.from('inquiries').select('id,kind,name,email,phone,topic,message,handled,created_at').order('created_at', { ascending: false }).limit(30);
  const box = $('#inqOut'); if (!box) return;
  if (error) { box.textContent = error.message; return; }
  if (!data.length) { box.textContent = 'Brak wiadomości.'; return; }
  box.replaceChildren(...data.map((q) => h('details', { class: 'more', style: 'border-bottom:1px solid var(--line);padding-bottom:8px' },
    h('summary', {}, `${q.handled ? '✓ ' : ''}${fmt(q.created_at)} · ${q.kind === 'quote' ? 'Wycena' : 'Kontakt'} · ${q.name}${q.topic ? ` · ${q.topic}` : ''}`),
    h('p', { style: 'white-space:pre-wrap;color:var(--text-2);margin:8px 0', text: q.message }),
    h('p', { class: 'small' }, h('a', { class: 'gold', href: `mailto:${q.email}?subject=${encodeURIComponent('Re: ' + (q.topic || 'Strike Tech Lab'))}`, text: q.email }), q.phone ? ` · ${q.phone}` : ''),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: q.handled ? 'Oznacz jako nowe' : 'Oznacz jako obsłużone', onclick: async () => { await sb.from('inquiries').update({ handled: !q.handled }).eq('id', q.id); loadInquiries(); } }))));
}

/* ------------------------------------------------------------------ finanse: przychody, wydatki, limity, arkusz rozliczeń */
const EXP_CAT = { czesci: 'Części i materiały', narzedzia: 'Narzędzia i sprzęt', oprogramowanie: 'Programy i licencje', hosting: 'Domena, hosting, usługi IT', reklama: 'Reklama i marketing', transport: 'Transport i wysyłka', biuro: 'Biuro i telefon', oplaty: 'Opłaty i prowizje', inne: 'Inne' };
const PAY_METHOD = { karta: 'karta', blik: 'BLIK', p24: 'Przelewy24', przelew: 'przelew', gotowka: 'gotówka', inna: 'inna' };
const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const monthName = (m) => `${MONTHS_PL[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const pctTxt = (x) => `${(Math.round(x * 1000) / 10).toLocaleString('pl-PL')}%`;
const zlFull = (g) => (g / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2 });
const fin = { sum: null, exp: [], bills: null, loading: false, err: '', exErr: '', billErr: '' };

/** Zdjęcie paragonu -> JPEG maks. 1800 px (mniejszy plik, poprawny obrót); PDF bez zmian. */
async function shrinkImage(file, max = 1800) {
  if (file.type === 'application/pdf') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.82));
  } catch { return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file : null; }
}
async function uploadReceipt(file, day) {
  const blob = await shrinkImage(file);
  if (!blob) throw new Error('Nie da się odczytać tego zdjęcia. Zrób zdjęcie jako JPG albo wgraj PDF.');
  if (blob.size > 10 * 1024 * 1024) throw new Error('Plik paragonu jest większy niż 10 MB.');
  const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${day.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw new Error(`Nie udało się wgrać paragonu: ${error.message}`);
  return path;
}
async function openReceipt(path) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('receipts').createSignedUrl(path, 300);
  if (error) { w?.close(); return toast('err', error.message); }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
}

async function loadFinance(force) {
  const out = $('#financeOut'); if (!out || !isAdmin || !sb || fin.loading) return;
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (lvl?.currentLevel !== 'aal2') { out.replaceChildren(h('div', { class: 'banner info', text: 'Finanse widzi tylko administrator po logowaniu dwuetapowym. Wejdź w zakładkę Administracja, potwierdź kod z aplikacji i wróć tutaj.' })); return; }
  if (fin.sum && !force) { renderFinance(); return; }
  fin.loading = true; if (!out.childElementCount) out.replaceChildren(h('p', { class: 'muted', text: 'Liczę przychody i wydatki…' }));
  try {
    const [s, e, bl] = await Promise.all([
      callFn('admin', { action: 'ledger_summary' }).then((d) => { fin.err = ''; return d; }, (err) => { fin.err = err.message; return null; }),
      sb.from('expenses').select('id,spent_on,category,description,vendor,doc_number,amount_grosze,is_cost,receipt_path,order_id').order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(200),
      sb.from('bills').select('*').order('issued_on', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    ]);
    fin.billErr = bl.error ? (/does not exist|schema cache|relation/i.test(bl.error.message) ? 'missing' : bl.error.message) : '';
    fin.bills = bl.data || [];
    fin.sum = s;
    fin.exErr = e.error ? (/does not exist|schema cache|relation/i.test(e.error.message) ? 'missing' : e.error.message) : '';
    fin.exp = e.data || [];
  } finally { fin.loading = false; }
  renderFinance();
}

function limitBar(pct, warnAt = 0.8) {
  const tone = pct > 1 ? 'bad' : pct >= warnAt ? 'warn' : 'ok';
  return h('div', { class: `limit-bar ${tone}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct * 100) }, h('i', { style: `width:${Math.min(100, pct * 100)}%` }));
}
function finCard(title, s, extra) {
  return h('div', { class: 'card fin-card' }, h('small', { class: 'muted', text: title }),
    h('div', { class: 'fin-big', text: zlFull(s?.net ?? 0) }), h('div', { class: 'muted small', text: 'przychód (wpłaty − zwroty)' }),
    h('dl', { class: 'fin-dl' },
      h('dt', { text: 'Zleceń opłaconych' }), h('dd', { text: String(s?.count ?? 0) }),
      h('dt', { text: 'Zwroty' }), h('dd', { text: zlFull(s?.refunds ?? 0) }),
      h('dt', { text: 'Koszty' }), h('dd', { text: zlFull(s?.costs ?? 0) }),
      h('dt', { text: 'Dochód' }), h('dd', { class: (s?.profit ?? 0) < 0 ? 'bad' : 'gold', text: zlFull(s?.profit ?? 0) })),
    extra || null);
}

function renderFinance() {
  const out = $('#financeOut'); if (!out) return;
  const S = Array.isArray(fin.sum?.months) ? fin.sum : null;
  if (fin.exErr === 'missing') { out.replaceChildren(h('div', { class: 'banner err', text: 'Brak tabeli wydatków – uruchom migrację v10 (npx supabase db push --linked) i wdróż funkcje admin, cron i stripe-webhook.' })); return; }
  const today = S?.today || todayKey();
  const curM = today.slice(0, 7), curQ = `${today.slice(0, 4)}-Q${Math.floor((+today.slice(5, 7) - 1) / 3) + 1}`, curY = today.slice(0, 4);
  const m = S?.months?.find((x) => x.month === curM), q = S?.quarters?.find((x) => x.quarter === curQ), y = S?.years?.find((x) => x.year === curY);
  const qLimit = q?.limit || 1081350;
  const sheet = S?.sheet || {};
  const syncBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Synchronizuj arkusz', onclick: async (e) => {
    const b = e.currentTarget; setBusy(b, true);
    try { const d = await callFn('admin', { action: 'ledger_sync' }); toast(d.ok ? 'ok' : 'err', d.enabled === false ? d.error : d.ok ? `Arkusz zaktualizowany: ${d.incomes} wpisów przychodu, ${d.expenses} wydatków.` : `Błąd arkusza: ${d.error}`); loadFinance(true); }
    catch (err) { toast('err', err.message); } setBusy(b, false, 'Synchronizuj arkusz');
  } });
  const head = h('div', { class: 'toolbar' },
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Odśwież', onclick: () => loadFinance(true) }), syncBtn,
    sheet.url ? h('a', { class: 'btn btn-ghost btn-sm', href: sheet.url, target: '_blank', rel: 'noopener', text: 'Otwórz arkusz Google' }) : null,
    h('span', { class: 'muted small', text: !S ? '' : sheet.enabled === false ? 'Arkusz Google nie jest skonfigurowany.' : sheet.error ? `Arkusz: błąd – ${sheet.error}` : sheet.pending ? 'Arkusz: zmiany czekają (cron co 5 min)' : sheet.synced_at ? `Arkusz aktualny · ${fmt(sheet.synced_at)}` : '' }));
  const cards = S ? h('div', { class: 'grid g3 fin-cards' },
    finCard(`Miesiąc: ${monthName(curM)}`, m),
    finCard(`Kwartał: ${curQ.replace('-', ' ')}`, q, h('div', { style: 'margin-top:12px' },
      h('div', { class: 'small', text: `Limit działalności nierejestrowanej: ${pctTxt((q?.net || 0) / qLimit)} z ${zlFull(qLimit)}` }), limitBar((q?.net || 0) / qLimit),
      h('div', { class: `small ${q?.flag ? 'bad' : 'muted'}`, text: q?.flag || `Zostało ${zlFull(Math.max(0, qLimit - (q?.net || 0)))} do końca kwartału.` }))),
    finCard(`Rok ${curY}`, y, h('div', { style: 'margin-top:12px' },
      h('div', { class: 'small', text: `Sprzedaż dla osób prywatnych: ${zlFull(y?.b2c || 0)} z ${zlFull(2000000)} (zwolnienie z kasy fiskalnej)` }), limitBar((y?.b2c || 0) / 2000000)))) :
    h('div', { class: 'banner err', text: `Nie udało się policzyć zestawień: ${fin.err || 'brak danych'}. Sprawdź, czy wdrożona jest migracja v10 i nowa funkcja admin.` });
  const months = S ? h('details', { class: 'more', open: false }, h('summary', { text: 'Miesiące i kwartały' }),
    h('div', { class: 'scroll-x' }, h('table', { class: 'adm fin-table' },
      h('thead', {}, h('tr', {}, ['Okres', 'Wpłaty', 'Zwroty', 'Przychód', 'Koszty', 'Dochód', 'Limit'].map((t) => h('th', { text: t })))),
      h('tbody', {}, [...S.quarters].reverse().flatMap((qq) => [
        h('tr', { class: 'q-row' }, h('td', {}, h('b', { text: qq.quarter.replace('-', ' ') })), h('td', { text: zlFull(qq.income) }), h('td', { text: zlFull(qq.refunds) }), h('td', {}, h('b', { text: zlFull(qq.net) })), h('td', { text: zlFull(qq.costs) }), h('td', { text: zlFull(qq.profit) }), h('td', { class: qq.pct > 1 ? 'bad' : qq.pct >= 0.8 ? 'warn' : '', text: qq.limit ? pctTxt(qq.pct) : '–' })),
        ...S.months.filter((mm) => `${mm.month.slice(0, 4)}-Q${Math.floor((+mm.month.slice(5, 7) - 1) / 3) + 1}` === qq.quarter).reverse().map((mm) =>
          h('tr', {}, h('td', { class: 'muted', text: monthName(mm.month) }), h('td', { text: zlFull(mm.income) }), h('td', { text: zlFull(mm.refunds) }), h('td', { text: zlFull(mm.net) }), h('td', { text: zlFull(mm.costs) }), h('td', { text: zlFull(mm.profit) }), h('td')))]))))) : null;
  out.replaceChildren(head, cards, months, billList(), expenseForm(), expenseList(),
    h('p', { class: 'note', style: 'margin-top:18px', text: 'Przychód liczony jest w dniu wpłaty (opłacone zlecenie), zwrot w dniu zwrotu. Prowizje Stripe dopisują się same jako koszt. Arkusz Google zawiera ewidencję sprzedaży (dzień po dniu, narastająco w miesiącu), zestawienia miesięczne, kwartalne i roczne – bez danych osobowych klientów. To pomoc w rozliczeniu, nie porada podatkowa.' }));
}

function expenseForm() {
  const date = h('input', { class: 'input', type: 'date', value: todayKey(), max: todayKey(), required: true });
  const catSel = h('select', { class: 'select' }, Object.entries(EXP_CAT).map(([k, v]) => h('option', { value: k, text: v })));
  const amount = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'np. 129,99', required: true });
  const desc = h('input', { class: 'input', maxlength: 300, placeholder: 'Co kupione, np. pasta termoprzewodząca Arctic MX-6', required: true });
  const vendor = h('input', { class: 'input', maxlength: 120, placeholder: 'Sklep / firma (opcj.)' });
  const doc = h('input', { class: 'input', maxlength: 80, placeholder: 'Nr paragonu / faktury (opcj.)' });
  const isCost = h('input', { type: 'checkbox', checked: true });
  const orderSel = h('select', { class: 'select' }, h('option', { value: '', text: 'Bez powiązania ze zleceniem' }),
    (adm.orders || []).filter((o) => o.order_number).slice(0, 60).map((o) => h('option', { value: o.id, text: `${o.order_number} · ${o.service_name}` })));
  const file = h('input', { class: 'input', type: 'file', accept: 'image/*,application/pdf', style: 'padding:9px' });
  const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: 'Dodaj wydatek' });
  return h('form', { class: 'card', style: 'margin-top:22px', onsubmit: async (e) => {
    e.preventDefault();
    const g = Math.round(parseFloat(amount.value.replace(/\s/g, '').replace(',', '.')) * 100);
    if (!(g > 0)) return toast('err', 'Wpisz kwotę, np. 129,99.');
    if (!desc.value.trim()) return toast('err', 'Wpisz, co zostało kupione.');
    setBusy(btn, true, 'Zapisuję…');
    try {
      const receipt_path = file.files[0] ? await uploadReceipt(file.files[0], date.value) : null;
      const { error } = await sb.from('expenses').insert({ spent_on: date.value, category: catSel.value, description: desc.value.trim(), vendor: vendor.value.trim() || null, doc_number: doc.value.trim() || null, amount_grosze: g, is_cost: isCost.checked, order_id: orderSel.value || null, receipt_path });
      if (error) { if (receipt_path) await sb.storage.from('receipts').remove([receipt_path]); throw error; }
      toast('ok', 'Wydatek zapisany – arkusz zaktualizuje się w ciągu kilku minut.'); loadFinance(true);
    } catch (err) { toast('err', err.message); setBusy(btn, false, 'Dodaj wydatek'); }
  } }, h('h3', { text: 'Dodaj wydatek' }),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Data zakupu' }), date), h('div', { class: 'field' }, h('label', { text: 'Kwota brutto (zł)' }), amount)),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Kategoria' }), catSel), h('div', { class: 'field' }, h('label', { text: 'Zlecenie' }), orderSel)),
    h('div', { class: 'field' }, h('label', { text: 'Opis' }), desc),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, vendor), h('div', { class: 'field' }, doc)),
    h('div', { class: 'field' }, h('label', { text: 'Zdjęcie paragonu lub faktura PDF (opcj.)' }), file),
    h('label', { class: 'check' }, isCost, h('span', { text: 'Koszt uzyskania przychodu (zakup na potrzeby usług). Odznacz dla wydatków prywatnych.' })), btn);
}

function expenseList() {
  const box = h('div', { class: 'card', style: 'margin-top:18px' }, h('h3', { text: `Wydatki (${fin.exp.length})` }));
  if (fin.exErr) { box.append(h('p', { class: 'bad', text: fin.exErr })); return box; }
  if (!fin.exp.length) { box.append(h('p', { class: 'muted', text: 'Nie ma jeszcze wydatków. Prowizje Stripe liczą się automatycznie i nie trzeba ich dopisywać.' })); return box; }
  box.append(h('div', { class: 'scroll-x' }, h('table', { class: 'adm fin-table' },
    h('thead', {}, h('tr', {}, ['Data', 'Opis', 'Kategoria', 'Kwota', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, fin.exp.map((x) => h('tr', {},
      h('td', { text: fmt(`${x.spent_on}T12:00:00Z`, { dateStyle: 'medium' }) }),
      h('td', {}, x.description, x.vendor || x.doc_number ? h('div', { class: 'muted small', text: [x.vendor, x.doc_number].filter(Boolean).join(' · ') }) : null, x.is_cost ? null : h('span', { class: 'pill ghost', text: 'nie koszt' })),
      h('td', { class: 'small', text: EXP_CAT[x.category] || x.category }),
      h('td', { style: 'white-space:nowrap', text: zlFull(x.amount_grosze) }),
      h('td', { style: 'white-space:nowrap' },
        x.receipt_path ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Paragon', onclick: () => openReceipt(x.receipt_path) }) : null,
        h('button', { class: 'x-btn', type: 'button', 'aria-label': `Usuń wydatek ${x.description}`, text: '×', onclick: async () => {
          if (!confirm(`Usunąć wydatek „${x.description}” (${zlFull(x.amount_grosze)})?`)) return;
          const { error } = await sb.from('expenses').delete().eq('id', x.id);
          if (error) return toast('err', error.message);
          if (x.receipt_path) await sb.storage.from('receipts').remove([x.receipt_path]);
          toast('ok', 'Wydatek usunięty.'); loadFinance(true);
        } }))))))));
  return box;
}

/** Szczegóły zlecenia: sposób płatności, prowizja, zwrot. */
function paymentBox(o) {
  if (!o.paid_at) return null;
  const amt = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'kwota zł', value: o.refund_grosze ? String(o.refund_grosze / 100).replace('.', ',') : '' });
  const day = h('input', { class: 'input', type: 'date', value: todayKey(), max: todayKey() });
  const btn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zapisz zwrot', onclick: async () => {
    const v = parseFloat(amt.value.replace(/\s/g, '').replace(',', '.') || '0');
    if (!(v >= 0)) return toast('err', 'Wpisz kwotę zwrotu (0 = brak zwrotu).');
    if (!confirm(v ? `Zapisać łączny zwrot ${zlFull(Math.round(v * 100))}? Zwroty kartą/BLIK w Stripe zapisują się same.` : 'Usunąć zapisany zwrot?')) return;
    setBusy(btn, true);
    try { await callFn('admin', { action: 'record_refund', order_id: o.id, amount_zl: v, date: day.value }); toast('ok', 'Zwrot zapisany w rozliczeniach.'); fin.sum = null; await loadAdmin(true); }
    catch (err) { toast('err', err.message); } setBusy(btn, false, 'Zapisz zwrot');
  } });
  const has = 'refund_grosze' in o;
  return h('div', { style: 'margin-top:16px' }, h('h4', { text: 'Płatność i zwrot' }),
    h('p', { class: 'small' }, `Wpłata ${zlFull(o.amount_due_grosze)} · ${fmt(o.paid_at)}`,
      has ? ` · ${PAY_METHOD[o.pay_method] || 'Stripe'}${o.stripe_fee_grosze ? ` · prowizja ${zlFull(o.stripe_fee_grosze)}` : ''}` : '',
      has && o.refund_grosze ? h('b', { class: 'bad', text: ` · zwrot ${zlFull(o.refund_grosze)} (${fmt(o.refunded_at, { dateStyle: 'medium' })})` }) : null),
    has ? h('div', { class: 'code-row' }, amt, day, btn) : h('p', { class: 'note', text: 'Zwroty wymagają migracji v10.' }),
    has ? h('p', { class: 'muted small', text: 'Kwota łączna zwrotu. Zwrot zrobiony w Stripe zapisuje się automatycznie – tutaj wpisuj tylko zwroty gotówką lub przelewem.' }) : null);
}

/* ------------------------------------------------------------------ rachunki i faktury bez VAT (migracja v11) */
const BILL_PAY = { stripe: 'Płatność online (Stripe)', karta: 'Karta (Stripe)', blik: 'BLIK (Stripe)', p24: 'Przelewy24 (Stripe)', przelew: 'Przelew', gotowka: 'Gotówka', inna: 'Inna' };
/** PDF tworzy serwer (funkcja admin) – tu tylko otwieramy plik z prywatnego archiwum. */
async function openBillPdf(b) {
  const w = window.open('', '_blank');
  try {
    if (!b.pdf_path) b.pdf_path = (await callFn('admin', { action: 'bill_pdf', bill_id: b.id })).path;
    const { data, error } = await sb.storage.from('bills').createSignedUrl(b.pdf_path, 300);
    if (error) throw error;
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  } catch (e) { w?.close(); toast('err', e.message); }
}
async function sendBill(b, to, btn) {
  if (!to) return toast('err', 'Wpisz e-mail klienta.');
  setBusy(btn, true, 'Wysyłam…');
  try {
    const d = await callFn('admin', { action: 'bill_send', bill_id: b.id, to });
    if (d.ok) { toast('ok', `Wysłano na ${d.to}.`); fin.bills = null; if (activeTab === 'finance') loadFinance(true); }
    else toast('err', d.error, 12000);
  } catch (e) { toast('err', e.message); }
  setBusy(btn, false, 'Wyślij e-mailem');
}
function b64Pdf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'application/pdf' }); }

/** Formularz rachunku; o = zlecenie (opcjonalnie) – dane klienta i pozycja wpisują się same. */
function billEditor(o) {
  const c = o?.customer || {}, biz = c.type === 'business';
  const kind = h('select', { class: 'select' }, h('option', { value: 'rachunek', text: 'Rachunek' }), h('option', { value: 'faktura', text: 'Faktura bez VAT (gdy klient o nią poprosi)' }));
  const today = todayKey(), paidDay = o?.paid_at ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(o.paid_at)) : '';
  const issued = h('input', { class: 'input', type: 'date', value: today, max: today });
  const sale = h('input', { class: 'input', type: 'date', value: today });
  const name = h('input', { class: 'input', maxlength: 160, value: biz ? (c.company || '') : (c.name || o?.profiles?.full_name || ''), placeholder: 'Imię i nazwisko / nazwa firmy' });
  const addr = h('input', { class: 'input', maxlength: 160, placeholder: 'Ulica i numer' });
  const pc = h('input', { class: 'input', maxlength: 100, value: o?.city ? `${o.city}` : '', placeholder: 'Kod pocztowy i miejscowość, np. 37-100 Łańcut' });
  const nip = h('input', { class: 'input', maxlength: 20, value: biz ? (c.nip || '') : '', placeholder: 'NIP (tylko firmy)' });
  const email = h('input', { class: 'input', type: 'email', maxlength: 200, value: o?.profiles?.email || c.email || '', placeholder: 'E-mail do wysyłki' });
  const pay = h('select', { class: 'select' }, Object.entries(BILL_PAY).map(([k, v]) => h('option', { value: k, text: v, selected: k === (o?.pay_method && BILL_PAY[o.pay_method] ? o.pay_method : o?.paid_at ? 'stripe' : 'przelew') })));
  const paidOn = h('input', { class: 'input', type: 'date', value: paidDay || '', max: today });
  const notes = h('input', { class: 'input', maxlength: 500, placeholder: 'Uwagi na dokumencie (opcj.)' });
  const rows = h('div', { class: 'bill-items' });
  const sumEl = h('b', { class: 'gold' });
  const recalc = () => { let t = 0; for (const r of rows.children) t += Math.round((parseFloat(r._q.value.replace(',', '.')) || 0) * Math.round((parseFloat(r._p.value.replace(/\s/g, '').replace(',', '.')) || 0) * 100)); sumEl.textContent = zlFull(t); };
  const addRow = (nm = '', q = 1, price = '') => {
    if (rows.children.length >= 12) return toast('err', 'Maksymalnie 12 pozycji.');
    const n = h('input', { class: 'input', maxlength: 200, value: nm, placeholder: 'Nazwa usługi / towaru', 'aria-label': 'Nazwa pozycji' });
    const q2 = h('input', { class: 'input', inputmode: 'decimal', value: String(q), 'aria-label': 'Ilość', oninput: recalc });
    const p = h('input', { class: 'input', inputmode: 'decimal', value: price, placeholder: 'cena zł', 'aria-label': 'Cena jednostkowa w zł', oninput: recalc });
    const r = h('div', { class: 'bill-row' }, n, q2, p, h('button', { class: 'x-btn', type: 'button', 'aria-label': 'Usuń pozycję', text: '×', onclick: () => { if (rows.children.length > 1) { r.remove(); recalc(); } } }));
    Object.assign(r, { _n: n, _q: q2, _p: p }); rows.append(r); recalc(); return n;
  };
  if (o) addRow(o.service_name + (o.express ? ' + Express' : ''), 1, o.amount_due_grosze ? String(o.amount_due_grosze / 100).replace('.', ',') : '');
  else addRow();
  const out = h('div');
  const btn = h('button', { class: 'btn btn-gold btn-sm', type: 'submit', text: 'Wystaw i utwórz PDF' });
  const collect = () => ({ kind: kind.value, order_id: o?.id, issued_on: issued.value, sale_date: sale.value, pay_method: pay.value, paid_on: paidOn.value || undefined, notes: notes.value,
    buyer: { name: name.value, address: addr.value, postal_city: pc.value, nip: nip.value, email: email.value },
    items: [...rows.children].map((r) => ({ name: r._n.value.trim(), qty: parseFloat(r._q.value.replace(',', '.')), unit: 'szt.', price_grosze: Math.round(parseFloat(r._p.value.replace(/\s/g, '').replace(',', '.')) * 100) })) });
  const prevBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Podgląd PDF', onclick: async (e) => {
    const b2 = e.currentTarget, w = window.open('', '_blank'); setBusy(b2, true);
    try { const d = await callFn('admin', { action: 'bill_preview', ...collect() }); const u = URL.createObjectURL(b64Pdf(d.pdf)); if (w) w.location.href = u; else downloadBlob(b64Pdf(d.pdf), 'podglad-rachunku.pdf'); }
    catch (er) { w?.close(); toast('err', er.message); } setBusy(b2, false, 'Podgląd PDF');
  } });
  return h('form', { class: 'bill-form', onsubmit: async (e) => {
    e.preventDefault();
    const data = collect(), items = data.items;
    if (items.some((it) => !it.name || !(it.qty > 0) || !(it.price_grosze >= 0))) return toast('err', 'Uzupełnij nazwę, ilość i cenę każdej pozycji.');
    if (!confirm(`Wystawić ${kind.value === 'faktura' ? 'fakturę' : 'rachunek'} na ${sumEl.textContent}? Numer zostanie nadany na stałe.`)) return;
    setBusy(btn, true, 'Wystawiam…');
    try {
      const d = await callFn('admin', { action: 'bill_issue', ...data });
      const bill = d.bill;
      fin.bills = null;
      const to = h('input', { class: 'input', type: 'email', value: email.value, placeholder: 'e-mail klienta' });
      const sendB = h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Wyślij e-mailem', onclick: (ev) => sendBill(bill, to.value.trim(), ev.currentTarget) });
      out.replaceChildren(h('div', { class: 'banner ok', style: 'margin-top:12px' }, h('b', { text: `Wystawiono ${bill.number} na ${zlFull(bill.total_grosze)}.` }),
        h('div', { class: 'code-row', style: 'margin-top:10px' }, to, sendB),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:8px', text: 'Otwórz PDF', onclick: () => openBillPdf(bill) }),
        o?.user_id ? h('p', { class: 'muted small', style: 'margin:8px 0 0', text: 'Kopia jest też w plikach zlecenia w Strefie Klienta.' }) : null));
      btn.remove(); prevBtn.remove(); toast('ok', `Wystawiono ${bill.number}.`);
    } catch (er) { toast('err', er.message); setBusy(btn, false, 'Wystaw i utwórz PDF'); }
  } },
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Dokument' }), kind), h('div', { class: 'field' }, h('label', { text: 'Sposób zapłaty' }), pay)),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Data wystawienia' }), issued), h('div', { class: 'field' }, h('label', { text: 'Data sprzedaży / wykonania usługi' }), sale)),
    h('h4', { text: 'Nabywca' }),
    h('div', { class: 'field' }, name), h('div', { class: 'row2' }, h('div', { class: 'field' }, addr), h('div', { class: 'field' }, pc)),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, nip), h('div', { class: 'field' }, email)),
    h('h4', { text: 'Pozycje' }), h('div', { class: 'bill-row bill-head', 'aria-hidden': 'true' }, h('span', { text: 'Nazwa' }), h('span', { text: 'Ilość' }), h('span', { text: 'Cena jedn. (zł)' }), h('span')), rows,
    h('div', { class: 'toolbar', style: 'justify-content:space-between;margin-top:8px' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Pozycja', onclick: () => addRow().focus() }), h('span', {}, 'Razem: ', sumEl)),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { text: 'Data zapłaty (puste = nie zapłacono)' }), paidOn), h('div', { class: 'field' }, h('label', { text: 'Uwagi' }), notes)),
    h('p', { class: 'muted small', text: 'Na dokumencie automatycznie: dane sprzedawcy, zwolnienie z VAT (art. 113 ust. 1), kwota słownie. Fakturę wystawiaj tylko, gdy klient o nią poprosi; od 2027 r. faktury trzeba wystawiać w KSeF.' }),
    h('div', { class: 'cta-row', style: 'margin:0;gap:8px' }, prevBtn, btn), out);
}

function billList() {
  const box = h('div', { class: 'card', style: 'margin-top:18px' }, h('div', { class: 'order-h' }, h('h3', { style: 'margin:0', text: 'Rachunki i faktury' })));
  if (fin.billErr === 'missing') { box.append(h('p', { class: 'note', text: 'Rachunki wymagają migracji v11 (npx supabase db push --linked) i nowej funkcji admin.' })); return box; }
  box.append(h('details', { class: 'more', style: 'margin:10px 0 14px' }, h('summary', { text: '+ Nowy rachunek (np. wpłata gotówką, zlecenie spoza strony)' }), billEditor(null)));
  if (fin.billErr) { box.append(h('p', { class: 'bad', text: fin.billErr })); return box; }
  if (!fin.bills?.length) { box.append(h('p', { class: 'muted', text: 'Brak wystawionych dokumentów. Po płatności przez Stripe rachunek wystawia się i wysyła klientowi automatycznie.' })); return box; }
  box.append(h('div', { class: 'scroll-x' }, h('table', { class: 'adm fin-table' },
    h('thead', {}, h('tr', {}, ['Numer', 'Data', 'Nabywca', 'Kwota', 'Status', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, fin.bills.map((b) => h('tr', { class: b.cancelled_at ? 'muted' : '' },
      h('td', {}, h('b', { text: b.number }), h('div', { class: 'muted small', text: b.kind === 'faktura' ? 'faktura' : 'rachunek' })),
      h('td', { text: fmt(`${b.issued_on}T12:00:00Z`, { dateStyle: 'medium' }) }),
      h('td', { text: b.buyer?.name || '–' }),
      h('td', { style: 'white-space:nowrap', text: zlFull(b.total_grosze) }),
      h('td', { class: 'small' }, b.cancelled_at ? h('span', { class: 'pill bad', text: 'anulowany' }) : b.sent_at ? h('span', { class: 'pill ok', text: `wysłany ${fmt(b.sent_at, { day: 'numeric', month: 'short' })}` }) : h('span', { class: 'pill ghost', text: 'nie wysłany' })),
      h('td', { style: 'white-space:nowrap' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'PDF', onclick: () => openBillPdf(b) }),
        b.cancelled_at ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-left:6px', text: 'Wyślij', onclick: (e) => { const to = prompt('Wyślij na adres e-mail:', b.sent_to || b.buyer?.email || ''); if (to) sendBill(b, to.trim(), e.currentTarget); } }),
        b.cancelled_at ? null : h('button', { class: 'x-btn', type: 'button', 'aria-label': `Anuluj ${b.number}`, title: 'Anuluj dokument', text: '×', onclick: async () => {
          const reason = prompt(`Anulować ${b.number}? Numer zostaje w rejestrze. Podaj powód (np. błędne dane nabywcy):`); if (!reason) return;
          try { await callFn('admin', { action: 'bill_cancel', bill_id: b.id, reason }); b.cancelled_at = new Date().toISOString(); b.cancel_reason = reason; toast('ok', `${b.number} anulowany.`); fin.bills = null; loadFinance(true); } catch (er) { toast('err', er.message); }
        } }))))))));
  return box;
}

/** Szczegóły zlecenia: wystawione dokumenty + formularz nowego. */
function orderBills(o) {
  const list = h('div');
  const form = h('details', { class: 'more' }, h('summary', { text: 'Wystaw rachunek do tego zlecenia' }), billEditor(o));
  sb.from('bills').select('*').eq('order_id', o.id).order('created_at').then(({ data, error }) => {
    if (error || !data?.length) return;
    form.hidden = data.some((b) => !b.cancelled_at);
    list.replaceChildren(...data.map((b) => h('div', { class: 'code-row', style: 'align-items:center;margin-bottom:6px' },
      h('span', { class: 'grow small' }, h('b', { text: b.number }), ` · ${zlFull(b.total_grosze)} · ${b.cancelled_at ? 'anulowany' : b.sent_at ? `wysłany na ${b.sent_to}` : 'nie wysłany'}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'PDF', onclick: () => openBillPdf(b) }),
      b.cancelled_at ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Wyślij', onclick: (e) => { const to = prompt('Wyślij na adres e-mail:', b.sent_to || b.buyer?.email || ''); if (to) sendBill(b, to.trim(), e.currentTarget); } }))));
  });
  return h('div', { style: 'margin-top:16px' }, h('h4', { text: 'Rachunek / faktura' }), list, form);
}

/* ------------------------------------------------------------------ opinie klientów: zatwierdzanie (migracja v18) */
async function loadAdminReviews() {
  const box = $('#revAdmOut'); if (!box) return;
  const { data, error } = await sb.from('reviews').select('id,rating,body,display_name,service_name,status,reject_reason,reply,created_at,published_at').order('created_at', { ascending: false }).limit(60);
  if (error) { box.replaceChildren(h('p', { class: 'note', text: /does not exist|schema cache/i.test(error.message) ? 'Opinie wymagają migracji v18 w bazie.' : error.message })); return; }
  if (!data.length) { box.replaceChildren(h('p', { class: 'muted small', text: 'Brak opinii. Klient może ją wystawić w Strefie Klienta po zakończeniu zlecenia.' })); return; }
  const LBL = { pending: ['Do zatwierdzenia', 'warn'], published: ['Opublikowana', 'ok'], rejected: ['Odrzucona', 'bad'] };
  box.className = 'rev-adm';
  box.replaceChildren(h('p', { class: 'muted small', style: 'margin:0', text: 'Zasada: publikujemy każdą prawdziwą opinię – także krytyczną. Odrzucaj tylko wulgaryzmy, dane osobowe albo treści niezwiązane z usługą (tego wymaga prawo konsumenckie).' }),
    ...data.map((r) => {
      const reply = h('input', { class: 'input', maxlength: 800, placeholder: 'Odpowiedź firmy (opcjonalnie, widoczna pod opinią)', value: r.reply || '' });
      const act = async (b, status, label) => {
        let reason = null;
        if (status === 'rejected') { reason = prompt('Powód odrzucenia (zobaczy go klient), np. „wulgaryzmy”, „dane osobowe”, „nie dotyczy usługi”:'); if (!reason) return; }
        setBusy(b, true);
        const { error: e } = await sb.rpc('review_moderate', { p_id: r.id, p_status: status, p_reply: reply.value.trim() || null, p_reason: reason });
        setBusy(b, false, label);
        if (e) return toast('err', e.message);
        toast('ok', status === 'published' ? 'Opinia opublikowana.' : status === 'rejected' ? 'Opinia odrzucona.' : 'Zapisano.'); loadAdminReviews(); loadReviews();
      };
      const [lbl, tone] = LBL[r.status] || [r.status, ''];
      return h('div', { class: 'rev-card' },
        h('div', { class: 'row' }, h('span', { class: 'rev-stars', 'aria-label': `Ocena ${r.rating} na 5` }, starsTxt(r.rating)), h('b', { text: r.display_name }), h('span', { class: 'muted small', text: `${r.service_name || ''} · ${fmt(r.created_at)}` }), h('span', { class: `pill ${tone}`, text: lbl })),
        h('p', { class: 'rev-body', text: r.body }),
        r.reject_reason ? h('p', { class: 'muted small', style: 'margin:0', text: `Powód odrzucenia: ${r.reject_reason}` }) : null,
        reply,
        h('div', { class: 'row' },
          r.status !== 'published' ? h('button', { class: 'btn btn-gold btn-sm', type: 'button', text: 'Opublikuj', onclick: (e) => act(e.currentTarget, 'published', 'Opublikuj') })
            : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Zapisz odpowiedź', onclick: (e) => act(e.currentTarget, 'published', 'Zapisz odpowiedź') }),
          r.status !== 'rejected' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Odrzuć', onclick: (e) => act(e.currentTarget, 'rejected', 'Odrzuć') }) : null));
    }));
}
