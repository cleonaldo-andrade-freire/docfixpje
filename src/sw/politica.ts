/**
 * Política de cache do service worker (spec §9.1): allowlist POR CAMINHO, nunca
 * padrão genérico. O SW cacheia só os assets da aplicação — jamais um blob de
 * documento do usuário.
 */

const PREFIXOS_PERMITIDOS = ['/assets/', '/motores/'];
const CAMINHOS_EXATOS = new Set(['/', '/index.html', '/sw.js', '/favicon.ico']);
const EXTENSOES_PERMITIDAS = ['.js', '.css', '.wasm', '.html', '.ico', '.woff2'];

export function podeCachear(url: string, origem: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin !== origem) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const p = u.pathname;
  if (CAMINHOS_EXATOS.has(p)) return true;
  if (!PREFIXOS_PERMITIDOS.some((pre) => p.startsWith(pre))) return false;
  return EXTENSOES_PERMITIDAS.some((ext) => p.endsWith(ext));
}
