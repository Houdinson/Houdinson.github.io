/* =====================================================================
   Strike Tech Lab – raporty STRIKE PROOF i instrukcje w PDF (bez bibliotek, działa w przeglądarce)
   Ten sam plik jest w web/stl-report.js i centrum/stl-report.js – po zmianie skopiuj go do obu
   (scripts/publikuj.ps1 ostrzega, gdy się różnią).

   Szablony raportów: dla każdej usługi pola „Sprzęt i ustawienia” (facts), grupy pomiarów
   [klucz, nazwa, jednostka, 'low' = mniej znaczy lepiej / 'high' = więcej lepiej / '' = bez oceny],
   domyślne prace i zalecenia. Klucze pomiarów: małe litery, cyfry i _ (max 40 znaków).
   ===================================================================== */

export const PROGRAMS = {
  anydesk: ['AnyDesk', 'Połączenie zdalne z komputerem klienta', 'https://anydesk.com/pl/downloads'],
  hwinfo: ['HWiNFO64', 'Czujniki: temperatury, moc, zegary, błędy WHEA; podsumowanie sprzętu', 'https://www.hwinfo.com/download/'],
  cinebench: ['Cinebench 2024', 'Test procesora (wynik punktowy i obciążenie do pomiaru temperatur)', 'https://www.maxon.net/cinebench'],
  occt: ['OCCT', 'Testy stabilności: CPU, pamięć RAM, karta graficzna (3D Adaptive)', 'https://www.ocbase.com/download'],
  capframex: ['CapFrameX', 'Pomiar FPS, 1% low i czasu klatki w grze', 'https://www.capframex.com/download'],
  afterburner: ['MSI Afterburner (+ RTSS)', 'Undervolting i krzywa wentylatorów karty, nakładka w grze', 'https://www.msi.com/Landing/afterburner/graphics-cards'],
  amdsw: ['AMD Software: Adrenalin', 'Sterownik i strojenie kart Radeon, Anti-Lag, FreeSync', 'https://www.amd.com/pl/support/download/drivers.html'],
  nvapp: ['NVIDIA App / Panel sterowania NVIDIA', 'Sterownik GeForce, Reflex, G-Sync, nakładka statystyk (Alt+R)', 'https://www.nvidia.com/pl-pl/software/nvidia-app/'],
  ryzenmaster: ['AMD Ryzen Master', 'Opcjonalnie: Curve Optimizer z Windows (trwalej – w BIOS-ie)', 'https://www.amd.com/pl/products/software/ryzen-master.html'],
  tdmark: ['3DMark (Steam)', 'Time Spy i Stress Test karty (Stress Test w wersji Advanced)', 'https://store.steampowered.com/app/223850/3DMark/'],
  latencymon: ['LatencyMon', 'Opóźnienia DPC/ISR i sterowniki, które je powodują', 'https://www.resplendence.com/latencymon'],
  ddu: ['Display Driver Uninstaller (DDU)', 'Czyste usunięcie sterownika karty przed instalacją', 'https://www.wagnardsoft.com/'],
  fancontrol: ['Fan Control', 'Krzywe wentylatorów obudowy i CPU z Windows', 'https://getfancontrol.com/'],
  crystaldiskinfo: ['CrystalDiskInfo', 'Stan dysków (S.M.A.R.T.)', 'https://crystalmark.info/en/software/crystaldiskinfo/'],
  memtest86: ['MemTest86', 'Test pamięci RAM z pendrive’a', 'https://www.memtest86.com/'],
  waveform: ['Test bufferbloat (Waveform)', 'Ping i opóźnienia łącza pod obciążeniem – w przeglądarce', 'https://www.waveform.com/tools/bufferbloat'],
  hddrawcopy: ['HDD Raw Copy Tool', 'Kopia uszkodzonego dysku sektor po sektorze', 'https://hddguru.com/software/HDD-Raw-Copy-Tool/'],
  chrome: ['Chrome DevTools → Lighthouse', 'Wydajność, dostępność i SEO strony (F12 → Lighthouse)', 'https://developer.chrome.com/docs/lighthouse'],
  searchconsole: ['Google Search Console', 'Weryfikacja domeny i mapa strony', 'https://search.google.com/search-console'],
  appsscript: ['Google Apps Script', 'Automatyzacje arkuszy i poczty Google', 'https://script.google.com/'],
  n8n: ['n8n', 'Automatyzacje (przepływy) między systemami', 'https://n8n.io/'],
  make: ['Make', 'Automatyzacje (scenariusze) między systemami', 'https://www.make.com/'],
  win: ['Windows – narzędzia wbudowane', 'Ustawienia, Menedżer zadań, Podgląd zdarzeń, Menedżer urządzeń', ''],
  centrum: ['Panel admina / Centrum', 'Zlecenie, zdjęcia, szablony wiadomości, raport STRIKE PROOF', ''],
};

const CPU = { k: 'cpu', l: 'Procesor', ph: 'np. AMD Ryzen 7 7800X3D' };
const GPU = { k: 'gpu', l: 'Karta graficzna', ph: 'np. RTX 4070 Super 12 GB' };
const RAM = { k: 'ram', l: 'Pamięć RAM', ph: 'np. 32 GB DDR5-6000 CL30' };
const MOBO = { k: 'mobo', l: 'Płyta główna i BIOS', ph: 'np. B650 Tomahawk, BIOS 7D75v1K' };
const GAME = { k: 'test_scene', l: 'Gra / scena testowa', ph: 'np. Cyberpunk 2077 – benchmark, 1440p Ultra' };

export const TEMPLATES = {
  'strike-precision-tune': {
    title: 'Undervolting i kultura pracy',
    lead: 'Pomiary wykonaliśmy w tych samych warunkach przed zmianami i po nich: ten sam test, ta sama scena, ten sam czas.',
    facts: [CPU, GPU, MOBO, { k: 'cpu_setting', l: 'Ustawienie procesora', ph: 'np. Curve Optimizer −20 (wszystkie rdzenie)' }, { k: 'gpu_setting', l: 'Ustawienie karty', ph: 'np. 925 mV @ 2700 MHz' }, { k: 'fan_setting', l: 'Wentylatory', ph: 'np. krzywa od temp. CPU, 0 RPM w spoczynku' }, GAME],
    groups: [
      { t: 'Procesor', m: [['cpu_temp', 'Temperatura CPU w obciążeniu', '°C', 'low'], ['cpu_power', 'Pobór mocy CPU', 'W', 'low'], ['cinebench', 'Cinebench 2024 (multi)', 'pkt', 'high']] },
      { t: 'Karta graficzna', m: [['gpu_temp', 'Temperatura GPU', '°C', 'low'], ['gpu_hotspot', 'Hot spot GPU', '°C', 'low'], ['gpu_power', 'Pobór mocy GPU', 'W', 'low'], ['gpu_clock', 'Zegar GPU w grze', 'MHz', 'high']] },
      { t: 'W grze', m: [['fps_avg', 'FPS średnio', 'FPS', 'high'], ['fps_1low', '1% low', 'FPS', 'high']] },
      { t: 'Kultura pracy', m: [['fan_rpm', 'Obroty wentylatorów karty', 'RPM', 'low'], ['noise_db', 'Hałas (50 cm od obudowy)', 'dB', 'low']] },
    ],
    works: ['Pomiar wyjściowy: temperatury, pobór mocy, FPS i hałas', 'Undervolting procesora z testami stabilności', 'Undervolting karty graficznej (krzywa napięcie/zegar)', 'Krzywe wentylatorów dopasowane do temperatur', 'Testy stabilności: OCCT, Cinebench, gra', 'Zapis profili i pokazanie, jak przywrócić ustawienia fabryczne'],
    recs: ['Po aktualizacji BIOS-u ustawienia procesora wracają do domyślnych – napisz do nas, przywrócimy je.', 'Po nowym sterowniku karty sprawdź, czy profil MSI Afterburner nadal się wczytuje przy starcie.', 'Jeśli pojawią się zawieszenia albo błędy w grze, daj nam znać – skorygujemy ustawienia.', 'Raz na 6–12 miesięcy wyczyść kurz z filtrów i radiatorów.'],
    note: 'Wynik undervoltingu zależy od konkretnego egzemplarza procesora i karty – dwa takie same modele mogą zachowywać się inaczej.',
  },
  'strike-zero-latency': {
    title: 'Optymalizacja systemu i opóźnień',
    lead: 'Porównujemy te same gry i sceny przed zmianami i po nich. Opóźnienia mierzymy narzędziami systemowymi i w grze.',
    facts: [CPU, GPU, RAM, { k: 'monitor', l: 'Monitor', ph: 'np. 240 Hz, DisplayPort' }, { k: 'games', l: 'Gry testowe', ph: 'np. CS2 (benchmark), Valorant (strzelnica)' }, { k: 'gpu_tweaks', l: 'Ustawienia karty', ph: 'np. Reflex + Boost, G-Sync + V-Sync, limit 237 FPS' }, { k: 'bios_tweaks', l: 'BIOS', ph: 'np. EXPO 6000, Resizable BAR włączony' }],
    groups: [
      { t: 'W grze', m: [['fps_avg', 'FPS średnio', 'FPS', 'high'], ['fps_1low', '1% low', 'FPS', 'high'], ['frametime_ms', 'Średni czas klatki', 'ms', 'low']] },
      { t: 'Opóźnienia', m: [['latency_ms', 'Opóźnienie systemu w grze (PC Latency)', 'ms', 'low'], ['dpc_us', 'Najwyższe opóźnienie DPC/ISR (LatencyMon)', 'µs', 'low']] },
      { t: 'System', m: [['ram_speed', 'Taktowanie pamięci', 'MT/s', 'high'], ['rebar', 'Resizable BAR', '', ''], ['startup_apps', 'Programy w autostarcie', 'szt.', 'low'], ['boot_s', 'Start systemu', 's', 'low']] },
      { t: 'Sieć', m: [['ping_ms', 'Ping', 'ms', 'low'], ['jitter_ms', 'Jitter', 'ms', 'low'], ['bufferbloat', 'Ocena bufferbloat (A–F)', '', '']] },
    ],
    works: ['Pomiar wyjściowy: FPS, czas klatki, opóźnienia, sieć', 'Porządki w Windows: autostart, zbędne programy, nakładki', 'Czysta instalacja sterownika karty (DDU)', 'Ustawienia karty i monitora: Reflex / Anti-Lag, synchronizacja, limit FPS', 'BIOS: profil pamięci XMP/EXPO, Resizable BAR', 'Sprawdzenie stabilności pamięci', 'Ustawienia sieci i myszy'],
    recs: ['Nie instaluj „optymalizatorów” i skryptów z internetu – potrafią cofnąć nasze ustawienia albo osłabić zabezpieczenia.', 'Po dużej aktualizacji Windows sprawdź autostart i tryb gry.', 'Po aktualizacji BIOS-u włącz ponownie XMP/EXPO (albo napisz do nas).'],
    note: 'Dokładny wzrost FPS i spadek opóźnień zależy od sprzętu, gry i stanu systemu przed usługą.',
  },
  'strike-overhaul': {
    title: 'Przegląd, czyszczenie i wymiana materiałów termicznych',
    lead: 'Temperatury mierzymy przy tym samym obciążeniu przed rozbiórką i po złożeniu komputera.',
    facts: [CPU, GPU, { k: 'cooler', l: 'Chłodzenie CPU', ph: 'np. Thermalright Peerless Assassin 120' }, { k: 'paste', l: 'Pasta na CPU', ph: 'np. Arctic MX-6' }, { k: 'pads', l: 'Pady / pasta na karcie', ph: 'np. pasta + pady 1,5 mm na pamięci' }, { k: 'smart', l: 'Stan dysków (S.M.A.R.T.)', ph: 'np. Dobry (NVMe 1 TB, 96% kondycji)' }, { k: 'ram_test', l: 'Test pamięci RAM', ph: 'np. MemTest86 – 1 przebieg bez błędów' }],
    groups: [
      { t: 'W obciążeniu', m: [['cpu_temp', 'Temperatura CPU', '°C', 'low'], ['gpu_temp', 'Temperatura GPU', '°C', 'low'], ['gpu_hotspot', 'Hot spot GPU', '°C', 'low'], ['cpu_clock', 'Zegar CPU pod obciążeniem', 'MHz', 'high']] },
      { t: 'W spoczynku', m: [['cpu_temp_idle', 'Temperatura CPU', '°C', 'low'], ['gpu_temp_idle', 'Temperatura GPU', '°C', 'low']] },
      { t: 'Kultura pracy', m: [['fan_rpm', 'Obroty wentylatora CPU', 'RPM', 'low'], ['noise_db', 'Hałas (50 cm od obudowy)', 'dB', 'low']] },
    ],
    works: ['Diagnostyka: temperatury, stan dysków, test pamięci', 'Rozbiórka i czyszczenie: radiatory, wentylatory, filtry', 'Wymiana pasty termoprzewodzącej na procesorze', 'Wymiana pasty i padów termicznych na karcie graficznej', 'Złożenie z poprawą prowadzenia kabli i przepływu powietrza', 'Test obciążeniowy po złożeniu'],
    recs: ['Czyść filtry przeciwkurzowe co 2–3 miesiące.', 'Nie stawiaj komputera na dywanie i przy ścianie – zostaw kilka centymetrów z tyłu.', 'Kolejny przegląd za 2–3 lata albo gdy temperatury wyraźnie wzrosną.'],
    note: '',
  },
  'strike-thermal-shield': {
    title: 'Regeneracja układu chłodzenia',
    lead: 'Temperatury i zegary mierzymy przy tym samym obciążeniu przed pracami i po nich.',
    facts: [CPU, GPU, { k: 'cooler', l: 'Chłodzenie', ph: 'np. AIO 360 mm' }, { k: 'tim', l: 'Materiał termiczny', ph: 'np. ciekły metal Conductonaut (za zgodą klienta)' }, { k: 'delid', l: 'Delid', ph: 'np. nie / tak – za pisemną zgodą' }, { k: 'airflow', l: 'Przepływ powietrza', ph: 'np. 3 wloty z przodu, 2 wyloty' }],
    groups: [
      { t: 'W obciążeniu', m: [['cpu_temp', 'Temperatura CPU', '°C', 'low'], ['gpu_temp', 'Temperatura GPU', '°C', 'low'], ['gpu_hotspot', 'Hot spot GPU', '°C', 'low'], ['cpu_clock', 'Zegar CPU pod obciążeniem', 'MHz', 'high'], ['throttling', 'Spadki zegara (throttling)', '', '']] },
      { t: 'Kultura pracy', m: [['fan_rpm', 'Obroty wentylatorów', 'RPM', 'low'], ['noise_db', 'Hałas (50 cm od obudowy)', 'dB', 'low']] },
    ],
    works: ['Pomiar wyjściowy temperatur, zegarów i hałasu', 'Czyszczenie i kontrola docisku chłodzenia', 'Wymiana materiału termicznego', 'Optymalizacja przepływu powietrza w obudowie', 'Krzywe wentylatorów', 'Test obciążeniowy po pracach'],
    recs: ['Czyść filtry co 2–3 miesiące.', 'Przy ciekłym metalu: kontrola temperatur po 2–4 tygodniach – napisz, jeśli wzrosną.'],
    note: '',
  },
  'strike-custom-assembly': {
    title: 'Montaż i testy komputera',
    lead: 'Komputer złożyliśmy z dostarczonych części i sprawdziliśmy testami obciążeniowymi przed wydaniem.',
    facts: [CPU, GPU, MOBO, RAM, { k: 'storage', l: 'Dyski', ph: 'np. NVMe 2 TB PCIe 4.0' }, { k: 'psu', l: 'Zasilacz', ph: 'np. 850 W 80+ Gold' }, { k: 'case_cooling', l: 'Obudowa i chłodzenie', ph: 'np. Lancool 216, AIO 280 mm' }, { k: 'os', l: 'System', ph: 'np. Windows 11 Pro – licencja klienta' }],
    groups: [
      { t: 'Testy stabilności', one: true, m: [['occt_cpu', 'OCCT CPU 30 min', '', ''], ['occt_mem', 'OCCT Memory 30 min', '', ''], ['gpu_stress', 'Test karty (3DMark / OCCT 3D)', '', ''], ['whea', 'Błędy sprzętowe WHEA', '', 'low']] },
      { t: 'Temperatury w obciążeniu', one: true, m: [['cpu_temp', 'Temperatura CPU', '°C', 'low'], ['gpu_temp', 'Temperatura GPU', '°C', 'low'], ['gpu_hotspot', 'Hot spot GPU', '°C', 'low']] },
      { t: 'Wydajność', one: true, m: [['cinebench', 'Cinebench 2024 (multi)', 'pkt', 'high'], ['timespy', '3DMark Time Spy (grafika)', 'pkt', 'high'], ['ram_speed', 'Taktowanie pamięci', 'MT/s', 'high']] },
    ],
    works: ['Sprawdzenie kompatybilności części', 'Montaż z prowadzeniem kabli i ustawieniem przepływu powietrza', 'Aktualizacja BIOS-u (jeśli była potrzebna)', 'Profil pamięci XMP/EXPO, Resizable BAR, krzywe wentylatorów', 'Instalacja systemu i sterowników (jeśli zamówiona)', 'Testy stabilności i temperatur'],
    recs: ['Zachowaj pudełka i dowody zakupu części – są potrzebne przy gwarancji producenta.', 'Pierwsze uruchomienie po transporcie: sprawdź, czy karta graficzna i kable siedzą pewnie.'],
    note: '',
  },
  'strike-revival': {
    title: 'Diagnostyka i naprawa',
    lead: 'Opis zgłoszonej usterki, wynik diagnostyki i wykonanej naprawy.',
    facts: [{ k: 'symptoms', l: 'Zgłoszone objawy', long: true, ph: 'np. komputer wyłącza się po 5 minutach gry' }, { k: 'diagnosis', l: 'Przyczyna (diagnoza)', long: true, ph: 'np. uszkodzony zasilacz – test zasilaczem referencyjnym' }, { k: 'repair', l: 'Naprawa / wymienione elementy', long: true, ph: 'np. wymiana zasilacza na 750 W 80+ Gold' }, { k: 'smart', l: 'Stan dysków (S.M.A.R.T.)', ph: 'np. Dobry' }, { k: 'data', l: 'Dane klienta', ph: 'np. nienaruszone / skopiowane na nowy dysk' }, { k: 'cost', l: 'Kosztorys', long: true, ph: 'np. zasilacz 389 zł + robocizna 100 zł' }],
    groups: [
      { t: 'Testy po naprawie', one: true, m: [['occt_cpu', 'OCCT CPU 30 min', '', ''], ['gpu_stress', 'Test karty / gra 15 min', '', ''], ['whea', 'Błędy sprzętowe WHEA', '', 'low'], ['cpu_temp', 'Temperatura CPU', '°C', 'low'], ['gpu_temp', 'Temperatura GPU', '°C', 'low']] },
    ],
    works: ['Wywiad i oględziny', 'Test zasilania i uruchomienie minimalne', 'Testy podzespołów na sprzęcie referencyjnym', 'Sprawdzenie dysków i zabezpieczenie danych', 'Naprawa po akceptacji kosztorysu', 'Testy po naprawie'],
    recs: ['Wymienione części zwracamy na życzenie.', 'Rób regularną kopię ważnych danych (np. dysk zewnętrzny albo chmura).'],
    note: '',
  },
  'strike-business-web': {
    title: 'Projekt i wdrożenie strony WWW',
    lead: 'Wyniki Lighthouse (Google) na telefonie: przed – dotychczasowa strona (jeśli była), po – nowa strona.',
    facts: [{ k: 'url', l: 'Adres strony', ph: 'np. https://firma.pl' }, { k: 'pages', l: 'Podstrony', long: true, ph: 'np. Start, Oferta, O nas, Kontakt' }, { k: 'integrations', l: 'Integracje', ph: 'np. formularz, Google Maps, kalendarz' }, { k: 'hosting', l: 'Domena i hosting', ph: 'np. na koncie klienta – …' }],
    groups: [{ t: 'Lighthouse (telefon)', m: [['lh_perf', 'Wydajność', 'pkt', 'high'], ['lh_a11y', 'Dostępność', 'pkt', 'high'], ['lh_bp', 'Dobre praktyki', 'pkt', 'high'], ['lh_seo', 'SEO', 'pkt', 'high'], ['lcp_s', 'Largest Contentful Paint', 's', 'low']] }],
    works: ['Rozmowa startowa i zakres prac', 'Makieta strony głównej', 'Wykonanie podstron w wersji na telefon i komputer', 'Formularze i integracje', 'SSL, mapa strony, Google Search Console', 'Szkolenie z obsługi i przekazanie dostępów'],
    recs: ['Aktualizuj treści co najmniej raz na kwartał – to pomaga w wynikach Google.', 'Dokumenty prawne (polityka prywatności, regulamin) powinien sprawdzić Twój prawnik.'],
    note: '',
  },
  'strike-smart-automation': {
    title: 'Automatyzacja procesów',
    lead: 'Porównanie czasu i liczby ręcznych kroków przed wdrożeniem i po nim (szacunek na podstawie typowego tygodnia).',
    facts: [{ k: 'process', l: 'Zautomatyzowany proces', long: true, ph: 'np. faktury z formularza trafiają do arkusza i księgowości' }, { k: 'tools', l: 'Narzędzia', ph: 'np. n8n, Google Sheets, Gmail' }, { k: 'error_handling', l: 'Obsługa błędów', ph: 'np. e-mail do biura przy nieudanym kroku' }],
    groups: [{ t: 'Efekt', m: [['hours_week', 'Czas pracy ręcznej', 'h/tydz.', 'low'], ['manual_steps', 'Ręczne kroki na zadanie', 'szt.', 'low'], ['errors_month', 'Pomyłki w miesiącu', 'szt.', 'low']] }],
    works: ['Audyt procesów i wybór zadań', 'Wdrożenie przepływów', 'Testy na danych testowych', 'Obsługa błędów i powiadomienia', 'Dokumentacja i szkolenie zespołu'],
    recs: ['Przy zmianie systemu (np. nowy CRM) daj nam znać – przepływ trzeba będzie dostosować.'],
    note: '',
  },
};
export const GENERIC = {
  title: 'Raport z pomiarów',
  lead: 'Pomiary wykonane w tych samych warunkach przed pracami i po nich.',
  facts: [CPU, GPU],
  groups: [{ t: 'Pomiary', m: [['fps_avg', 'FPS średnio', 'FPS', 'high'], ['fps_1low', '1% low', 'FPS', 'high'], ['cpu_temp', 'Temperatura CPU', '°C', 'low'], ['gpu_temp', 'Temperatura GPU', '°C', 'low'], ['latency_ms', 'Opóźnienie', 'ms', 'low'], ['noise_db', 'Hałas', 'dB', 'low']] }],
  works: [], recs: [], note: '',
};

/** Szablon dla zlecenia: usługa główna + dołączone (config.extras). Pola i pomiary bez powtórzeń. */
export function templateFor(serviceId, extras = []) {
  const ids = [serviceId, ...(extras || [])].filter((id, i, a) => id && a.indexOf(id) === i);
  const list = ids.map((id) => TEMPLATES[id]).filter(Boolean);
  if (!list.length) return { ...GENERIC, ids };
  if (list.length === 1) return { ...list[0], ids };
  const seenF = new Set(), seenM = new Set(), groups = [];
  for (const t of list) for (const g of t.groups) {
    const m = g.m.filter(([k]) => !seenM.has(k)); m.forEach(([k]) => seenM.add(k));
    if (!m.length) continue;
    const same = groups.find((x) => x.t === g.t && !!x.one === !!g.one);
    if (same) same.m.push(...m); else groups.push({ ...g, m });
  }
  const uniq = (a) => [...new Set(a)];
  return {
    ids, title: list.map((t) => t.title).join(' + '), lead: list[0].lead,
    facts: list.flatMap((t) => t.facts).filter((f) => !seenF.has(f.k) && seenF.add(f.k)),
    groups, works: uniq(list.flatMap((t) => t.works)), recs: uniq(list.flatMap((t) => t.recs)),
    note: uniq(list.map((t) => t.note).filter(Boolean)).join(' '),
  };
}
/** Opis pomiaru (nazwa, jednostka, kierunek) – także dla kluczy spoza szablonu. */
export function metricInfo(key) {
  for (const t of [...Object.values(TEMPLATES), GENERIC]) for (const g of t.groups) for (const [k, l, u, d] of g.m) if (k === key) return { l, u, d };
  return { l: key.replace(/_/g, ' '), u: '', d: /temp|latency|lag|noise|_db$|boot|_ms$|_us$|_s$|error|whea/.test(key) ? 'low' : 'high' };
}
const ABS_UNITS = ['°C', 'dB', 'ms', 'µs', 's'];
/** Zmiana między „przed” i „po”: { text, good } albo null. */
export function change(key, b, a, info = metricInfo(key)) {
  if (typeof b !== 'number' || typeof a !== 'number') return null;
  const diff = a - b; if (diff === 0) return { text: 'bez zmian', good: null };
  const good = info.d === 'low' ? diff < 0 : info.d === 'high' ? diff > 0 : null;
  const sign = diff > 0 ? '+' : '−', n = (v) => String(Math.round(Math.abs(v) * 10) / 10).replace('.', ',');
  if (ABS_UNITS.includes(info.u)) return { text: `${sign}${n(diff)} ${info.u}`, good };
  if (b === 0) return { text: `${sign}${n(diff)}${info.u ? ' ' + info.u : ''}`, good };
  return { text: `${sign}${n(diff / Math.abs(b) * 100)}%`, good };
}

/* ------------------------------------------------------------------ rysowanie */
const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace";
const W = 1240, H = 1754, M = 92;
const HEXP = [[627, 303], [853, 417], [853, 697], [627, 872], [400, 697], [400, 417]];
const BOLTP = [[778, 212], [474, 624], [655, 583], [472, 918], [778, 512], [612, 546]];
async function fontsReady() { try { await Promise.all([document.fonts.load(`800 40px ${FONT}`), document.fonts.load(`500 20px ${FONT}`), document.fonts.load(`700 20px ${FONT}`)]); } catch { /* */ } }
function drawLogo(x, cx, cy, hgt, bg = '#080808') {
  const k = hgt / 750, P = (pts) => pts.map(([px, py]) => [cx + (px - 630) * k, cy + (py - 565) * k]);
  x.save(); x.lineJoin = 'miter';
  x.strokeStyle = '#FFBB00'; x.lineWidth = 28 * k; x.beginPath(); P(HEXP).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.stroke();
  x.beginPath(); P(BOLTP).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
  x.lineWidth = 34 * k; x.strokeStyle = bg; x.lineJoin = 'round'; x.stroke(); x.fillStyle = '#FFBB00'; x.fill();
  x.restore();
}
function wrap(x, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      while (x.measureText(line).width > maxW && line.length > 1) {   // bardzo długie słowo (np. adres URL)
        let cut = line.length - 1; while (cut > 1 && x.measureText(line.slice(0, cut)).width > maxW) cut--;
        out.push(line.slice(0, cut)); line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}
const fmtVal = (v, u) => v === undefined || v === null || v === '' ? '–' : `${typeof v === 'number' ? String(v).replace('.', ',') : v}${u && typeof v === 'number' ? ' ' + u : ''}`;

/** Strony raportu STRIKE PROOF (ciemne, w kolorach marki). */
export async function renderReport({ order, tpl, before = {}, after = {}, facts = {}, works = [], recs = [], dateText }) {
  await fontsReady();
  const pages = []; let c, x, y;
  const date = dateText || new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', year: 'numeric' });
  const newPage = () => {
    c = document.createElement('canvas'); c.width = W; c.height = H; x = c.getContext('2d');
    x.fillStyle = '#0a0a0b'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W, 0, 10, W, 0, 900); g.addColorStop(0, 'rgba(255,187,0,.15)'); g.addColorStop(1, 'rgba(255,187,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,187,0,.6)'; x.lineWidth = 4;
    [[30, 30, 1, 1], [W - 30, H - 30, -1, -1]].forEach(([px, py, sx, sy]) => { x.beginPath(); x.moveTo(px, py + 60 * sy); x.lineTo(px, py); x.lineTo(px + 60 * sx, py); x.stroke(); });
    y = M;
    if (pages.length) { // nagłówek kolejnych stron
      drawLogo(x, M + 22, y + 22, 52, '#0a0a0b'); x.fillStyle = '#FFBB00'; x.font = `800 22px ${FONT}`; x.textAlign = 'left'; x.fillText('STRIKE PROOF', M + 60, y + 30);
      x.fillStyle = '#7d7d86'; x.font = `600 20px ${FONT}`; x.textAlign = 'right'; x.fillText(order.order_number || '', W - M, y + 30); x.textAlign = 'left'; y += 80;
    }
  };
  const footer = (n, total) => {
    x.fillStyle = '#7d7d86'; x.font = `500 19px ${FONT}`; x.textAlign = 'left';
    x.fillText(`Strike Tech Lab · Raport STRIKE PROOF${order.order_number ? ' · ' + order.order_number : ''}`, M, H - 52);
    x.textAlign = 'right'; x.fillText(`str. ${n} z ${total}`, W - M, H - 52); x.textAlign = 'left';
  };
  const need = (hh) => { if (y + hh > H - 120) { pages.push(c); newPage(); } };
  const heading = (t) => { need(90); x.fillStyle = '#FFBB00'; x.font = `800 22px ${FONT}`; x.fillText(t.toUpperCase(), M, y + 22); y += 46; };
  newPage();
  // --- nagłówek
  drawLogo(x, M + 50, y + 62, 124, '#0a0a0b');
  x.fillStyle = '#FFBB00'; x.font = `800 28px ${FONT}`; x.fillText('STRIKE TECH LAB', M + 124, y + 40);
  x.fillStyle = '#fff'; x.font = `800 76px ${FONT}`; x.fillText('STRIKE PROOF', M + 120, y + 118);
  y += 172;
  x.fillStyle = '#e4e4e8'; x.font = `700 32px ${FONT}`;
  for (const l of wrap(x, tpl.title, W - 2 * M)) { x.fillText(l, M, y); y += 42; }
  x.fillStyle = '#a3a3ab'; x.font = `500 23px ${FONT}`; y += 4;
  for (const l of wrap(x, tpl.lead, W - 2 * M)) { x.fillText(l, M, y); y += 33; }
  y += 22;
  const info = [['Zlecenie', order.order_number || '–'], ['Data raportu', date], ['Klient', order.client || '–'], ['Usługa', order.service_name || '–']];
  info.forEach(([k, v], i) => {
    const cx = M + (i % 2) * 540, cy = y + Math.floor(i / 2) * 82;
    x.fillStyle = '#7d7d86'; x.font = `700 19px ${FONT}`; x.fillText(k.toUpperCase(), cx, cy);
    x.fillStyle = '#fff'; x.font = `700 27px ${FONT}`; x.fillText(wrap(x, v, 500)[0] + (wrap(x, v, 500).length > 1 ? '…' : ''), cx, cy + 36);
  });
  y += 176;
  // --- najważniejsze wyniki (do 3 największych popraw)
  // po jednym z grupy; temperatury i hałas (zmiana w °C / dB) mają pierwszeństwo, bo są najbardziej czytelne
  const cand = tpl.groups.filter((g) => !g.one).map((g) => g.m.map(([k, l, u, d]) => ({ k, l, ch: change(k, before[k], after[k], { l, u, d }),
    score: (typeof before[k] === 'number' && before[k] ? Math.abs((after[k] - before[k]) / before[k]) : 0) * (ABS_UNITS.includes(u) ? 2 : 1) }))
    .filter((r) => r.ch?.good).sort((a, b) => b.score - a.score)[0]).filter(Boolean);
  const best = cand.sort((a, b) => b.score - a.score).slice(0, 3);
  if (best.length) {
    const bw = (W - 2 * M - (best.length - 1) * 24) / best.length;
    best.forEach((r, i) => {
      const bx = M + i * (bw + 24);
      x.fillStyle = 'rgba(255,187,0,.08)'; x.strokeStyle = 'rgba(255,187,0,.45)'; x.lineWidth = 2;
      x.beginPath(); x.roundRect(bx, y, bw, 150, 18); x.fill(); x.stroke();
      x.fillStyle = '#3ddc84'; x.font = `800 50px ${FONT}`; x.fillText(r.ch.text, bx + 26, y + 72);
      x.fillStyle = '#d7d7dc'; x.font = `600 22px ${FONT}`; wrap(x, r.l, bw - 52).slice(0, 2).forEach((l, j) => x.fillText(l, bx + 26, y + 108 + j * 28));
    });
    y += 186;
  }
  // --- sprzęt i ustawienia
  const fl = tpl.facts.filter((f) => String(facts[f.k] ?? '').trim());
  if (fl.length) {
    heading('Sprzęt i ustawienia');
    for (const f of fl) {
      x.font = `500 24px ${FONT}`; const lines = wrap(x, facts[f.k], f.long ? W - 2 * M : W - 2 * M - 360);
      need(lines.length * 34 + (f.long ? 40 : 18));
      x.fillStyle = '#8c8c95'; x.font = `600 21px ${FONT}`; x.fillText(f.l, M, y + 26);
      x.fillStyle = '#f0f0f2'; x.font = `500 24px ${FONT}`;
      lines.forEach((l, i) => x.fillText(l, f.long ? M : M + 360, y + 26 + (f.long ? 34 : 0) + i * 34));
      y += lines.length * 34 + (f.long ? 46 : 18);
    }
    y += 18;
  }
  // --- pomiary
  const cols = [M, M + 560, M + 760, M + 930];
  for (const g of tpl.groups) {
    const rows = g.m.filter(([k]) => (g.one ? [after[k]] : [before[k], after[k]]).some((v) => v !== undefined && v !== ''));
    if (!rows.length) continue;
    heading(g.t);
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(M - 16, y, W - 2 * M + 32, 50);
    x.fillStyle = '#a3a3ab'; x.font = `700 20px ${FONT}`;
    (g.one ? ['Pomiar', 'Wynik'] : ['Pomiar', 'Przed', 'Po', 'Zmiana']).forEach((t, i) => x.fillText(t, cols[i], y + 33)); y += 50;
    for (const [k, l, u, d] of rows) {
      const b = before[k], a = after[k], ch = g.one ? null : change(k, b, a, { l, u, d }), bar = !g.one && typeof b === 'number' && typeof a === 'number';
      x.font = `800 25px ${FONT}`; const oneLines = g.one ? wrap(x, fmtVal(a, u), W - M - cols[1]) : [];
      need(bar ? 112 : 76 + Math.max(0, oneLines.length - 1) * 32);
      x.fillStyle = '#fff'; x.font = `600 24px ${FONT}`; x.fillText(wrap(x, l, 530)[0], cols[0], y + 40);
      if (g.one) { x.fillStyle = '#FFBB00'; x.font = `800 25px ${FONT}`; oneLines.forEach((t, i) => x.fillText(t, cols[1], y + 40 + i * 32)); }
      else {
        x.fillStyle = '#c9c9cf'; x.font = `600 25px ${FONT}`; x.fillText(fmtVal(b, u), cols[1], y + 40);
        x.fillStyle = '#FFBB00'; x.font = `800 25px ${FONT}`; x.fillText(fmtVal(a, u), cols[2], y + 40);
      }
      if (ch) { x.fillStyle = ch.good === null ? '#a3a3ab' : ch.good ? '#3ddc84' : '#ff6b5e'; x.font = `800 25px ${FONT}`; x.fillText(ch.text, cols[3], y + 40); }
      if (bar) {
        const max = Math.max(Math.abs(a), Math.abs(b)) || 1, bw = W - 2 * M;
        x.fillStyle = 'rgba(255,255,255,.13)'; x.fillRect(cols[0], y + 60, bw * Math.abs(b) / max, 9);
        x.fillStyle = '#FFBB00'; x.fillRect(cols[0], y + 74, bw * Math.abs(a) / max, 9);
      }
      const hh = bar ? 104 : 66 + Math.max(0, oneLines.length - 1) * 32;
      x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 2; x.beginPath(); x.moveTo(M - 16, y + hh); x.lineTo(W - M + 16, y + hh); x.stroke();
      y += hh + 6;
    }
    y += 22;
  }
  // własne pomiary spoza szablonu
  const known = new Set(tpl.groups.flatMap((g) => g.m.map(([k]) => k)));
  const extra = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !known.has(k));
  if (extra.length) {
    heading('Dodatkowe pomiary');
    for (const k of extra) {
      const inf = { ...metricInfo(k), ...(facts._labels?.[k] ? { l: facts._labels[k] } : {}) }, ch = change(k, before[k], after[k], inf); need(76);
      x.fillStyle = '#fff'; x.font = `600 24px ${FONT}`; x.fillText(wrap(x, inf.l, 530)[0], cols[0], y + 40);
      x.fillStyle = '#c9c9cf'; x.font = `600 25px ${FONT}`; x.fillText(fmtVal(before[k], inf.u), cols[1], y + 40);
      x.fillStyle = '#FFBB00'; x.font = `800 25px ${FONT}`; x.fillText(fmtVal(after[k], inf.u), cols[2], y + 40);
      if (ch) { x.fillStyle = ch.good === null ? '#a3a3ab' : ch.good ? '#3ddc84' : '#ff6b5e'; x.fillText(ch.text, cols[3], y + 40); }
      y += 72;
    }
    y += 22;
  }
  if (tpl.groups.some((g) => !g.one)) { need(40); x.fillStyle = '#7d7d86'; x.font = `500 18px ${FONT}`; x.fillText('Pasek szary – przed, złoty – po. Zielona zmiana to poprawa (dla temperatur, hałasu i opóźnień – spadek).', M, y + 10); y += 50; }
  const list = (title, items) => {
    items = items.map((s) => String(s).trim()).filter(Boolean); if (!items.length) return;
    heading(title); x.font = `500 24px ${FONT}`;
    for (const it of items) {
      const lines = wrap(x, it, W - 2 * M - 40); need(lines.length * 36 + 8);
      lines.forEach((l, i) => { if (!i) { x.fillStyle = '#FFBB00'; x.fillText('▸', M, y + 26); } x.fillStyle = '#e4e4e8'; x.fillText(l, M + 36, y + 26); y += 36; });
      y += 8;
    }
    y += 20;
  };
  list('Wykonane prace', works); list('Zalecenia', recs);
  if (tpl.note) { x.font = `500 20px ${FONT}`; const lines = wrap(x, tpl.note, W - 2 * M); need(lines.length * 28 + 10); x.fillStyle = '#8c8c95'; lines.forEach((l) => { x.fillText(l, M, y + 20); y += 28; }); }
  pages.push(c);
  pages.forEach((cv, i) => { x = cv.getContext('2d'); footer(i + 1, pages.length); });
  return toImages(pages);
}

/** Strony instrukcji krok po kroku (jasne, do druku). body = [{t, steps:[{t,d,w,k,p}]}] */
export async function renderGuide({ title, body, updated }) {
  await fontsReady();
  const pages = []; let c, x, y, n = 0;
  const INK = '#15151a', SUB = '#4a4a55', GOLD = '#c98f00';
  const newPage = () => {
    c = document.createElement('canvas'); c.width = W; c.height = H; x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#FFBB00'; x.fillRect(0, 0, W, 14);
    y = M - 20;
    if (pages.length) { drawLogo(x, M + 18, y + 18, 44, '#fff'); x.fillStyle = INK; x.font = `800 21px ${FONT}`; x.fillText(title, M + 52, y + 26); y += 70; }
  };
  const need = (hh) => { if (y + hh > H - 110) { pages.push(c); newPage(); } };
  newPage();
  drawLogo(x, M + 40, y + 50, 100, '#fff');
  x.fillStyle = GOLD; x.font = `800 22px ${FONT}`; x.fillText('STRIKE TECH LAB · INSTRUKCJA SERWISOWA', M + 104, y + 30);
  x.fillStyle = INK; x.font = `800 40px ${FONT}`;
  const tl = wrap(x, title, W - 2 * M - 104); tl.forEach((l, i) => x.fillText(l, M + 104, y + 80 + i * 48)); y += 80 + tl.length * 48 + 10;
  x.fillStyle = '#b3261e'; x.font = `700 19px ${FONT}`; x.fillText('Dokument wewnętrzny – nie udostępniaj klientom.' + (updated ? `  Wersja z ${updated}.` : ''), M, y); y += 44;
  // programy
  const keys = [...new Set(body.flatMap((s) => s.steps.flatMap((st) => st.p || [])))].filter((k) => PROGRAMS[k]);
  if (keys.length) {
    x.fillStyle = INK; x.font = `800 26px ${FONT}`; x.fillText('Programy i narzędzia', M, y + 6); y += 34;
    x.fillStyle = SUB; x.font = `500 19px ${FONT}`; x.fillText('Pobieraj tylko z oficjalnych stron producentów (adresy poniżej).', M, y + 6); y += 30;
    for (const k of keys) {
      const [nm, why, url] = PROGRAMS[k];
      x.font = `500 20px ${FONT}`; const wl = wrap(x, why, 520);
      const hh = Math.max(wl.length * 26, url ? 52 : 26) + 22; need(hh);
      x.fillStyle = '#f6f6f8'; x.fillRect(M - 12, y, W - 2 * M + 24, hh - 8);
      x.fillStyle = INK; x.font = `700 21px ${FONT}`; wrap(x, nm, 300).slice(0, 2).forEach((l, i) => x.fillText(l, M, y + 30 + i * 26));
      x.fillStyle = SUB; x.font = `500 20px ${FONT}`; wl.forEach((l, i) => x.fillText(l, M + 320, y + 30 + i * 26));
      if (url) { x.fillStyle = '#1a56c4'; x.font = `500 17px ${MONO}`; wrap(x, url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W - M - (M + 860)).slice(0, 2).forEach((l, i) => x.fillText(l, M + 860, y + 30 + i * 22)); }
      y += hh;
    }
    y += 26;
  }
  // sekcje i kroki
  for (const sec of body) {
    need(140);
    x.fillStyle = '#FFBB00'; x.fillRect(M, y + 4, 8, 34);
    x.fillStyle = INK; x.font = `800 28px ${FONT}`; x.fillText(sec.t, M + 24, y + 32); y += 58;
    for (const st of sec.steps) {
      n++;
      x.font = `700 23px ${FONT}`; const tLines = wrap(x, st.t, W - 2 * M - 120);
      x.font = `500 21px ${FONT}`; const dLines = st.d ? wrap(x, st.d, W - 2 * M - 120) : [];
      x.font = `500 19px ${MONO}`; const kLines = st.k ? wrap(x, st.k, W - 2 * M - 210) : [];
      const pText = (st.p || []).map((k) => PROGRAMS[k]?.[0]).filter(Boolean).join(' · ');
      const hh = tLines.length * 30 + dLines.length * 28 + (kLines.length ? kLines.length * 26 + 40 : 0) + (pText ? 34 : 0) + 26;
      need(hh);
      const top = y;
      if (st.w) { x.fillStyle = '#fdecea'; x.fillRect(M + 60, top - 6, W - 2 * M - 60, hh - 8); x.fillStyle = '#b3261e'; x.fillRect(M + 60, top - 6, 6, hh - 8); }
      x.strokeStyle = '#9a9aa3'; x.lineWidth = 2.5; x.strokeRect(M + 2, top + 2, 26, 26);   // pole do odhaczenia
      x.fillStyle = '#8a8a93'; x.font = `700 17px ${FONT}`; x.textAlign = 'center'; x.fillText(String(n), M + 15, top + 52); x.textAlign = 'left';
      let yy = top + 24;
      x.fillStyle = st.w ? '#b3261e' : INK; x.font = `700 23px ${FONT}`;
      tLines.forEach((l, i) => { x.fillText((i === 0 && st.w ? '⚠ ' : '') + l, M + 80, yy); yy += 30; });
      x.fillStyle = SUB; x.font = `500 21px ${FONT}`; dLines.forEach((l) => { x.fillText(l, M + 80, yy); yy += 28; });
      if (kLines.length) {
        yy += 6; const bh = kLines.length * 26 + 22;
        x.fillStyle = '#fff7df'; x.fillRect(M + 80, yy - 4, W - 2 * M - 80, bh); x.fillStyle = '#FFBB00'; x.fillRect(M + 80, yy - 4, 4, bh);
        x.fillStyle = '#7a5a00'; x.font = `800 15px ${FONT}`; x.fillText('KLIKNIJ', M + 96, yy + 16);
        x.fillStyle = INK; x.font = `500 19px ${MONO}`; kLines.forEach((l, i) => x.fillText(l, M + 180, yy + 17 + i * 26));
        yy += bh + 4;
      }
      if (pText) { x.fillStyle = '#1a56c4'; x.font = `700 18px ${FONT}`; x.fillText(`Program: ${pText}`, M + 80, yy + 18); yy += 34; }
      y = Math.max(yy, top + 64) + 14;
    }
    y += 14;
  }
  pages.push(c);
  pages.forEach((cv, i) => {
    x = cv.getContext('2d'); x.fillStyle = '#8a8a93'; x.font = `500 18px ${FONT}`;
    x.fillText('Strike Tech Lab · instrukcja wewnętrzna', M, H - 48); x.textAlign = 'right'; x.fillText(`str. ${i + 1} z ${pages.length}`, W - M, H - 48); x.textAlign = 'left';
  });
  return toImages(pages);
}

async function toImages(canvases) {
  return Promise.all(canvases.map(async (cv) => {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height, preview: cv.toDataURL('image/jpeg', 0.55) };
  }));
}
/** PDF z obrazów JPEG – jedna strona A4 na obraz. */
export function toPdf(pages, PW = 595.28, PH = 841.89) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const put = (v) => { const b = typeof v === 'string' ? enc.encode(v) : v; parts.push(b); len += b.length; };
  const obj = (id, ...body) => { offs[id] = len; put(`${id} 0 obj\n`); body.forEach(put); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, iid = pid + 1, cid = pid + 2, content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    obj(iid, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`, p.bytes, '\nendstream');
    obj(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 3 + n * 3, xref = len;
  put(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) put(`${String(offs[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
/** Wartość z pola formularza: liczba (przecinek lub kropka) albo tekst (maks. 60 znaków). */
export const parseVal = (v) => { const t = String(v ?? '').trim(); if (t === '') return undefined; const n = t.replace(/\s/g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(n) ? +n : t.slice(0, 60); };
export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
