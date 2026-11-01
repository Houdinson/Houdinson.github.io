/* =====================================================================
   KONFIGURACJA – jedyne miejsce do uzupełnienia przed publikacją.
   Wartości z Supabase: Dashboard → Project Settings → API (Data API)
     SUPABASE_URL  – "Project URL", np. https://abcdefghijkl.supabase.co
     SUPABASE_KEY  – klucz PUBLICZNY "anon" albo "Publishable" (sb_publishable_…)
   NIGDY nie wpisuj tu klucza service_role / sb_secret_ ani kluczy Stripe sk_ / whsec_.
   Do testów na własnym komputerze (http://localhost:3000 + `supabase start`)
   wystarczy wpisać DEV_SUPABASE_KEY (anon key z `supabase status`).
   ===================================================================== */
window.STL_CONFIG = {
  SUPABASE_URL: 'https://xnqocoxhsbqaikrgjftk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_wpa-Dl46K-TqCVSQiMCkJw_Sb5jCJso',
  DEV_SUPABASE_URL: 'http://127.0.0.1:54321',
  DEV_SUPABASE_KEY: '',
  CONTACT_EMAIL: 'striketechlab@proton.me',
  /* DANE SPRZEDAWCY – obowiązkowe przed publikacją (ustawa o prawach konsumenta art. 12,
     ustawa o świadczeniu usług drogą elektroniczną art. 5). Wpisz dokładnie tak, jak w CEIDG.
     Działalność nierejestrowana: imię i nazwisko + adres; pola, których nie masz (NIP, REGON), zostaw puste. */
  COMPANY: {
    NAME: 'Mikołaj Szmuc Strike Tech Lab',
    ADDRESS: 'Wysoka 74, 37-100 Łańcut',
    NIP: '',
    REGON: '',
    PHONE: '',           // telefon kontaktowy (jeśli udostępniasz)
    REGISTRY: 'działalność nierejestrowana – art. 5 ust. 1 ustawy Prawo przedsiębiorców',
    RETURN_ADDRESS: '',  // adres do odsyłania sprzętu i zwrotów (puste = ADDRESS)
    HOSTING: 'Cloudflare, Inc. (hosting strony)',   // dopisz firmę od skrzynki e-mail, gdy kupisz domenę
    MAIL_PROVIDER: ''    // usługa wysyłająca maile z systemu (np. ta sama firma hostingowa)
  },
  /* CAPTCHA przy logowaniu i rejestracji (Cloudflare Turnstile). Puste = wyłączone.
     Najpierw włącz CAPTCHA w Supabase (Authentication → Attack Protection), potem wpisz tu Site Key.
     Do testów na localhost: '1x00000000000000000000AA' (klucz testowy Cloudflare, zawsze przechodzi). */
  TURNSTILE_SITE_KEY: '0x4AAAAAAFvDKFfVoSV4oJFX'
};
