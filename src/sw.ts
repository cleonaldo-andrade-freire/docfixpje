/// <reference lib="webworker" />
import { podeCachear } from './sw/politica';

/**
 * Service worker: torna a aplicação utilizável offline (requisito funcional,
 * spec §11) cacheando SÓ os próprios assets, por allowlist de caminho (§9.1).
 * Nunca cacheia resposta opaca, blob: ou Range.
 */

declare const self: ServiceWorkerGlobalScope;

const CACHE = 'validador-pje-v1';
const ESSENCIAIS = ['/', '/index.html'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  if (!podeCachear(req.url, self.location.origin)) return;

  ev.respondWith(
    caches.match(req).then((cacheado) => {
      if (cacheado) return cacheado;
      return fetch(req).then((resp) => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          void caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      });
    }),
  );
});
