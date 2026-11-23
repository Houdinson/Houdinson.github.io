/* =====================================================================
   Strike Tech Lab – reguły rozliczeń: limity, kasa fiskalna, szacunek PIT, podsumowanie roczne.
   Ten sam plik jest w web/fin-rules.js i centrum/fin-rules.js – po zmianie skopiuj go do obu.
   To pomoc w rozliczeniu, nie porada podatkowa. Kwoty w groszach.
   ===================================================================== */

/* ---------- USTAWIENIA DO UZUPEŁNIANIA ---------- */
export const SETTINGS = {
  // Dzień startu działalności nierejestrowanej. Wydatki z lat PRZED rokiem startu nie są kosztem;
  // wydatki z roku startu sprzed tej daty mogą nim być, jeśli wyraźnie dotyczą usług.
  START_DATE: '2026-11-23',
  // Data urodzenia (RRRR-MM-DD) – do ulgi dla młodych. Puste = szacunek bez uwzględnienia 26. urodzin.
  BIRTH_DATE: '',
  // Inne OPODATKOWANE dochody w roku (np. zlecenie po 26. urodzinach, etat bez ulgi), w groszach.
  // Zlecenie zwolnione ulgą dla młodych NIE wpisuj – nie zużywa kwoty wolnej.
  OTHER_TAXABLE_INCOME: { 2026: 0, 2027: 0 },
  // Składki społeczne ze zleceń do odliczenia od dochodu (z PIT-11, także przy zleceniu zwolnionym ulgą dla młodych), w groszach.
  ZUS_DEDUCTIBLE: { 2026: 0, 2027: 0 },
};

/* ---------- PRZEPISY (aktualizuj co rok) ---------- */
// Minimalne wynagrodzenie w groszach. Limit kwartalny = 225% (art. 5 ust. 1 Prawa przedsiębiorców).
// null = jeszcze nie wpisane: panel liczy wtedy z ostatniej znanej kwoty i pokazuje ostrzeżenie.
export const MIN_WAGE = { 2026: 480600, 2027: null };
export const KASA_LIMIT = 2000000;          // zwolnienie podmiotowe z kasy: 20 000 zł sprzedaży dla osób prywatnych rocznie
const PIT = { free: 3000000, threshold: 12000000, low: 0.12, high: 0.32, reduce: 360000 };

const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
const dayIndex = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+iso.slice(0, 4), 0, 1)) / 864e5);

/** Limit przychodu na kwartał w danym roku. estimated = brak płacy minimalnej na ten rok. */
export function quarterLimit(year) {
  const y = +year;
  if (MIN_WAGE[y]) return { value: Math.round(MIN_WAGE[y] * 2.25), estimated: false };
  const known = Object.keys(MIN_WAGE).map(Number).filter((k) => MIN_WAGE[k] && k <= y).sort((a, b) => b - a)[0]
    ?? Object.keys(MIN_WAGE).map(Number).filter((k) => MIN_WAGE[k]).sort((a, b) => a - b)[0];
  return { value: Math.round(MIN_WAGE[known] * 2.25), estimated: true, from: known };
}

/** Limit kasy fiskalnej w roku – w roku startu proporcjonalnie do liczby dni działalności. */
export function kasaLimit(year) {
  const y = +year, start = SETTINGS.START_DATE, sy = +start.slice(0, 4);
  if (y !== sy) return { value: KASA_LIMIT, prorated: false, beforeStart: y < sy };
  const days = daysInYear(y) - dayIndex(start);
  return { value: Math.round(KASA_LIMIT * days / daysInYear(y)), prorated: days < daysInYear(y), days };
}

/** Wydatek z roku wcześniejszego niż rok startu – w PIT nie jest kosztem (brak przychodu z tego źródła w tamtym roku). */
export const isBeforeStart = (day) => !!day && day.slice(0, 4) < SETTINGS.START_DATE.slice(0, 4);

/** Ostrzeżenie przy limicie kwartalnym: null albo { level: 'warn'|'stop'|'over', text }. */
export function limitAlert(net, limit) {
  const p = net / limit;
  if (p > 1) return { level: 'over', text: 'Limit przekroczony – wniosek do CEIDG w ciągu 7 dni od dnia przekroczenia.' };
  if (p >= 0.9) return { level: 'stop', text: 'Ponad 90% limitu – nowe płatności przesuwaj na następny kwartał.' };
  if (p >= 0.7) return { level: 'warn', text: 'Ponad 70% limitu – przyjmuj już tylko małe zlecenia.' };
  return null;
}

function taxOn(base) {
  if (base <= 0) return 0;
  const t = base <= PIT.threshold ? PIT.low * base - PIT.reduce : PIT.low * PIT.threshold - PIT.reduce + PIT.high * (base - PIT.threshold);
  return Math.max(0, Math.round(t));
}

/** Szacunek PIT od dochodu ze Strike w roku (skala, kwota wolna wspólna z innymi opodatkowanymi dochodami). */
export function pitEstimate(year, profit) {
  const y = +year, other = SETTINGS.OTHER_TAXABLE_INCOME[y] || 0, zus = SETTINGS.ZUS_DEDUCTIBLE[y] || 0;
  const withStrike = taxOn(other + Math.max(0, profit) - zus), without = taxOn(other - zus);
  const tax = Math.max(0, withStrike - without);
  const notes = [];
  const b = SETTINGS.BIRTH_DATE;
  if (!b) notes.push('Uzupełnij datę urodzenia w fin-rules.js – po 26. urodzinach zlecenie jest opodatkowane i zjada kwotę wolną.');
  else {
    const bday26 = `${+b.slice(0, 4) + 26}${b.slice(4)}`;
    if (+bday26.slice(0, 4) === y) notes.push(`26. urodziny ${bday26}: zlecenie od tego dnia wpisz w OTHER_TAXABLE_INCOME.`);
    else if (+bday26.slice(0, 4) < y && !other) notes.push('Masz już 26 lat – wpisz opodatkowany dochód ze zlecenia w OTHER_TAXABLE_INCOME.');
  }
  const freeLeft = Math.max(0, PIT.free - Math.max(0, other - zus));
  return { tax, reserve: Math.ceil(tax / 1000) * 1000, freeLeft, notes };
}

/** Podsumowanie roku do PIT-36: rok z ledger_summary + lista wydatków z tego roku. */
export function yearSummary(yearStats, expenses) {
  const costs = expenses.filter((x) => x.is_cost);
  const costExp = costs.reduce((a, x) => a + x.amount_grosze, 0);
  const totalCosts = yearStats?.costs ?? costExp;
  return {
    income: yearStats?.income ?? 0, refunds: yearStats?.refunds ?? 0, net: yearStats?.net ?? 0,
    costs: totalCosts, costExp, costAuto: Math.max(0, totalCosts - costExp), profit: yearStats?.profit ?? 0,
    costList: costs,
    noDoc: costs.filter((x) => !x.receipt_path && !x.doc_number),
    beforeStart: costs.filter((x) => isBeforeStart(x.spent_on)),
  };
}

/** CSV (średnik, UTF-8 z BOM – otwiera się w Excelu) z listą kosztów. */
export function costsCsv(list, catNames = {}) {
  const esc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Data', 'Opis', 'Sklep / firma', 'Nr dokumentu', 'Kategoria', 'Kwota (zł)', 'Skan dokumentu']]
    .concat(list.map((x) => [x.spent_on, x.description, x.vendor, x.doc_number, catNames[x.category] || x.category, (x.amount_grosze / 100).toFixed(2).replace('.', ','), x.receipt_path ? 'tak' : 'BRAK']));
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function downloadText(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
