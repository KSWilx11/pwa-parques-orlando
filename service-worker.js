// service-worker.js

const CACHE_NAME = 'parque-filas-orlando-cache-v2'; // Cache atualizado para forçar a atualização
const urlsToCache = [
    '/', 
    '/index.html',
    '/estilos.css',
    '/script.js',
    '/manifest.json',
    '/assets/icons/icon-192x192.png', 
    '/assets/icons/icon-512x512.png'  
];

// Evento de Instalação: Cacheia os ficheiros da app shell
self.addEventListener('install', event => {
    console.log('[Service Worker] Evento de Instalação. Cache Name:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] A fazer cache da app shell:', urlsToCache);
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('[Service Worker] Falha ao fazer cache da app shell:', error);
            })
    );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
    console.log('[Service Worker] Evento de Ativação. Ativando cache:', CACHE_NAME);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] A limpar cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); 
});

// Evento Fetch: Serve ficheiros do cache primeiro, com fallback para a rede
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Ignora pedidos que não são GET
    if (event.request.method !== 'GET') {
        console.log('[Service Worker] Pedido não-GET, a ignorar:', event.request.method, requestUrl.pathname);
        return; // Deixa o navegador tratar
    }

    // Se o pedido for para a nossa função proxy Netlify
    if (requestUrl.pathname.startsWith('/.netlify/functions/')) {
        console.log('[Service Worker] Pedido para função Netlify, a passar diretamente para a rede:', requestUrl.href);
        // Para estes pedidos, queremos SEMPRE ir à rede (não servir do cache)
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.error('[Service Worker] Erro ao fazer fetch para a função Netlify:', error, requestUrl.href);
                    // Opcional: retornar uma resposta de erro genérica se o fetch falhar
                    // return new Response(JSON.stringify({ error: "Falha ao contactar o servidor proxy" }), {
                    //     headers: { 'Content-Type': 'application/json' },
                    //     status: 503, // Service Unavailable
                    //     statusText: "Proxy fetch failed"
                    // });
                    throw error; // Re-lança o erro para que o .catch no script.js principal possa tratar
                })
        );
        return; // Importante para não continuar para a lógica de cache abaixo
    }

    // Se o pedido for para a API externa queue-times.com (não deveria acontecer se o script.js estiver a usar o proxy)
    // Esta condição é uma salvaguarda.
    if (requestUrl.hostname === 'queue-times.com') {
        console.warn('[Service Worker] Pedido detetado diretamente para queue-times.com. Isto deveria ir através do proxy. A passar para a rede, mas pode falhar devido a CORS.', requestUrl.href);
        // Não tenta cache, apenas vai para a rede. O CORS provavelmente bloqueará isto no cliente.
        event.respondWith(fetch(event.request));
        return;
    }

    // Para outros pedidos (HTML, CSS, JS, imagens locais), usa a estratégia Cache First
    console.log('[Service Worker] A intercetar pedido fetch para asset local:', requestUrl.href);
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log('[Service Worker] A servir do cache:', event.request.url);
                    return response;
                }
                console.log('[Service Worker] Não encontrado no cache, a buscar na rede:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Opcional: Cache dinâmico de novos assets locais se desejar
                        // if (networkResponse && networkResponse.status === 200 && 
                        //     requestUrl.origin === self.location.origin && 
                        //     !urlsToCache.includes(requestUrl.pathname)) { // Evita re-cachear o que já está em urlsToCache
                        //     const responseToCache = networkResponse.clone();
                        //     caches.open(CACHE_NAME)
                        //         .then(cache => {
                        //             console.log('[Service Worker] A fazer cache dinâmico de novo recurso local:', event.request.url);
                        //             cache.put(event.request, responseToCache);
                        //         });
                        // }
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('[Service Worker] Erro ao buscar na rede asset local:', error, event.request.url);
                    // Considerar retornar uma página offline de fallback aqui se relevante
                });
            })
    );
});
