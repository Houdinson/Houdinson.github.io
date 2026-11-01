/* Konfiguracja Centrum Dowodzenia – te same klucze PUBLICZNE co na stronie (web/index.html).
   NIGDY nie wpisuj tu klucza service_role / sb_secret_ ani kluczy Stripe. */
window.STL_CENTRUM = {
  SUPABASE_URL: 'https://xnqocoxhsbqaikrgjftk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_wpa-Dl46K-TqCVSQiMCkJw_Sb5jCJso',
  SUPABASE_JS: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  // CAPTCHA przy logowaniu (Cloudflare Turnstile) – ten sam Site Key co w web/config.js. Puste = wyłączone.
  TURNSTILE_SITE_KEY: '0x4AAAAAAFvDKFfVoSV4oJFX',
};
