// service-worker.js

const CACHE_NAME = 'parque-filas-orlando-cache-v1'; // Mantenha ou atualize se alterar urlsToCache significativamente
const urlsToCache = [
    '/', 
    '/index.html',
    '/estilos.css',
    '/script.js',
    '/manifest.json',
    // Adicione os seus ícones principais aqui, se ainda não o fez
    '/assets/icons/icon-192x192.png', // Exemplo
    '/assets/icons/icon-512x512.png'  // Exemplo
];

// Evento de Instalação: Cacheia os ficheiros da app shell
self.addEventListener('install', event => {
    console.log('[Service Worker] Evento de Instalação');
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
    console.log('[Service Worker] Evento de Ativação');
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

// Evento Fetch: Serve ficheiros do cache primeiro, com fallback para a rede, IGNORANDO chamadas à API/Proxy
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Ignora pedidos que não são GET
    if (event.request.method !== 'GET') {
        console.log('[Service Worker] Pedido não-GET, a passar para a rede:', event.request.method, requestUrl.pathname);
        return; // Deixa o navegador tratar
    }

    // Se o pedido for para a nossa função proxy Netlify ou para a API externa,
    // não tente servir do cache, apenas vá para a rede.
    // Isso evita que o Service Worker tente fazer um fetch direto para queue-times.com que seria bloqueado por CORS.
    if (requestUrl.pathname.startsWith('/.netlify/functions/') || requestUrl.hostname === 'queue-times.com') {
        console.log('[Service Worker] Pedido para API/Proxy, a passar diretamente para a rede:', requestUrl.href);
        // Para estes pedidos, pode simplesmente não chamar event.respondWith e deixar o navegador tratar,
        // ou pode explicitamente fazer fetch, mas é mais simples deixar o navegador se não houver lógica de cache aqui.
        // Se quiser ter certeza que ele vai para a rede SEM TENTAR CACHE:
        // event.respondWith(fetch(event.request));
        return; // Deixa o navegador tratar o pedido como faria normalmente.
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
                        // Opcional: Cache dinâmico de novos assets locais se desejar (ex: imagens não listadas em urlsToCache)
                        // if (networkResponse && networkResponse.status === 200 && 
                        //     requestUrl.origin === self.location.origin && // Só faz cache de recursos da mesma origem
                        //     !urlsToCache.includes(requestUrl.pathname)) {
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
                    // Pode retornar uma página offline de fallback aqui, se tiver uma
                });
            })
    );
});
