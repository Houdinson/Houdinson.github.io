// Generuje statyczne kopie podstron z index.html (Cloudflare Pages serwuje /serwis → serwis/index.html).
// Wszystkie strony mają tę samą treść (aplikacja SPA), różnią się nagłówkiem: <title>, description, canonical, og:*.
// Tytuły i opisy bierze z tabeli ROUTES w assets/app.js – jedno źródło prawdy dla Google i dla nawigacji w przeglądarce.
// Uruchom po każdej zmianie index.html albo ROUTES:   node tools/strony.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://striketechlab.pl';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const app = read('assets/app.js');
const m = app.match(/const ROUTES = (\{[\s\S]*?\n\});/);
if (!m) throw new Error('Nie znalazłem tabeli ROUTES w assets/app.js');
const ROUTES = Function(`return ${m[1]}`)();

const NOINDEX = new Set(['/konto', '/potwierdzenie']);
const src = read('index.html');
const crlf = src.includes('\r\n');
const tpl = src.replace(/\r\n/g, '\n');
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function page(p, { noindex = false, canonical = true } = {}) {
  const [view, title, desc, , h1] = ROUTES[p] || ROUTES['/'];
  const url = SITE + (p === '/' ? '/' : p);
  const sub = (re, val) => { if (!re.test(out)) throw new Error(`${p}: brak ${re}`); out = out.replace(re, val); };
  let out = tpl;
  sub(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  sub(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`);
  sub(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`);
  sub(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(desc)}">`);
  sub(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  sub(/<link rel="canonical" href="[^"]*">\n?/, canonical ? `<link rel="canonical" href="${url}">\n` : '');
  if (view === 'uslugi') sub(/<h1 class="h2" id="svcH1">[^<]*<\/h1>/, `<h1 class="h2" id="svcH1">${attr(h1 || 'Usługi i ceny')}</h1>`);
  out = out.replace(/<meta name="robots" content="[^"]*">/, '');
  if (noindex) out = out.replace('<meta name="theme-color"', '<meta name="robots" content="noindex"><meta name="theme-color"');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

const written = [];
for (const p of Object.keys(ROUTES)) {
  const file = p === '/' ? 'index.html' : `${p.slice(1)}/index.html`;
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, file), page(p, { noindex: NOINDEX.has(p) }));
  written.push(file);
}
fs.writeFileSync(path.join(ROOT, '404.html'), page('/', { noindex: true, canonical: false }));
written.push('404.html');

// sitemap: tylko strony do indeksowania
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(ROUTES).filter((p) => !NOINDEX.has(p))
  .map((p) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`Zapisano: ${written.join(', ')}, sitemap.xml (${urls.length} adresów)`);
