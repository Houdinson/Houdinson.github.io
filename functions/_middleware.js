// Cloudflare Pages Functions – działa przed każdym żądaniem.
// Jedna domena dla klientów: strike-tech-lab.pages.dev i www → https://striketechlab.pl (301, ścieżka i parametry zostają).
// Powód: logowanie i koszyk są zapisane osobno dla każdej domeny, więc klient na .pages.dev wracał ze Stripe
// na .pl jako „niezalogowany”. Podglądy gałęzi (<hash>.strike-tech-lab.pages.dev) zostają bez przekierowania.
const CANONICAL = 'striketechlab.pl';
const REDIRECT_HOSTS = new Set(['strike-tech-lab.pages.dev', 'www.striketechlab.pl']);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.protocol = 'https:'; url.hostname = CANONICAL; url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
