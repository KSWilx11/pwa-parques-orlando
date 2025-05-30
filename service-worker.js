    // service-worker.js

    const CACHE_NAME = 'parque-filas-orlando-cache-v1';
    const urlsToCache = [
        '/', // Redireciona para index.html na raiz
        '/index.html',
        '/estilos.css',
        '/script.js',
        '/manifest.json',
        // Adicione aqui os caminhos para os seus ícones principais se quiser que sejam cacheados imediatamente
        // Exemplo: '/assets/icons/icon-192x192.png',
        // '/assets/icons/icon-512x512.png'
        // É melhor manter esta lista pequena e focar nos ficheiros essenciais da "app shell"
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
        return self.clients.claim(); // Torna este service worker o controlador ativo imediatamente
    });

    // Evento Fetch: Serve ficheiros do cache primeiro, com fallback para a rede
    self.addEventListener('fetch', event => {
        console.log('[Service Worker] A intercetar pedido fetch para:', event.request.url);
        // Apenas para pedidos GET. Outros tipos de pedidos (POST, etc.) devem ir para a rede.
        if (event.request.method !== 'GET') {
            console.log('[Service Worker] Pedido não-GET, a passar para a rede:', event.request.method, event.request.url);
            return;
        }

        // Estratégia: Cache, falling back to network (Cache first)
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        console.log('[Service Worker] A servir do cache:', event.request.url);
                        return response; // Se encontrado no cache, serve do cache
                    }
                    console.log('[Service Worker] Não encontrado no cache, a buscar na rede:', event.request.url);
                    // Se não estiver no cache, busca na rede
                    return fetch(event.request).then(
                        networkResponse => {
                            // Opcional: Se quiser fazer cache dinâmico de novos recursos (ex: imagens carregadas depois)
                            // É preciso ter cuidado aqui para não cachear tudo indiscriminadamente.
                            // if (networkResponse && networkResponse.status === 200 && !urlsToCache.includes(event.request.url)) {
                            //     const responseToCache = networkResponse.clone();
                            //     caches.open(CACHE_NAME)
                            //         .then(cache => {
                            //             console.log('[Service Worker] A fazer cache dinâmico de novo recurso:', event.request.url);
                            //             cache.put(event.request, responseToCache);
                            //         });
                            // }
                            return networkResponse;
                        }
                    ).catch(error => {
                        console.error('[Service Worker] Erro ao buscar na rede:', error, event.request.url);
                        // Opcional: Pode retornar uma página offline de fallback aqui
                        // return caches.match('/offline.html'); // Se tiver uma página offline.html
                    });
                })
        );
    });
    