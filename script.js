// script.js - v3 Funcionalidade de Alarme, Busca, Filtro de Status, Notificar Aberto, Contagem e Registo de SW
document.addEventListener('DOMContentLoaded', () => {
    // Registo do Service Worker (Adicionado para PWA)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js') 
                .then(registration => {
                    console.log('[Main Script] Service Worker registado com sucesso:', registration);
                })
                .catch(error => {
                    console.error('[Main Script] Falha ao registar Service Worker:', error);
                });
        });
    } else {
        console.log('[Main Script] Service Worker não é suportado neste navegador.');
    }


    const parks = [
        { id: 8, name: "Disney's Animal Kingdom", icon: "🐾" },
        { id: 7, name: "Disney's Hollywood Studios", icon: "🎬" },
        { id: 5, name: "Epcot", icon: "🌐" },
        { id: 6, name: "Magic Kingdom", icon: "🏰" },
        { id: 334, name: "Epic Universe", icon: "🌌" },
        { id: 64, name: "Islands of Adventure", icon: "🏝️" },
        { id: 65, name: "Universal Studios Florida", icon: "🎥" }
    ];

    // Elementos do DOM
    const parkListContainer = document.getElementById('park-list-container');
    const rideListSection = document.getElementById('ride-list-section');
    const parkListSection = document.getElementById('park-list-section');
    const selectedParkNameElement = document.getElementById('selected-park-name');
    const rideListContainer = document.getElementById('ride-list-container');
    const backToParksButton = document.getElementById('back-to-parks');
    const showAllBtn = document.getElementById('show-all-btn');
    const showFavoritesBtn = document.getElementById('show-favorites-btn');
    const notificationPermissionSection = document.getElementById('notification-permission-section');
    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    const pageNotificationBanner = document.getElementById('page-notification-banner');
    const pageNotificationMessage = document.getElementById('page-notification-message');
    const closePageNotificationBtn = document.getElementById('close-page-notification');
    const searchRideInput = document.getElementById('search-ride-input');
    const showOnlyOpenCheckbox = document.getElementById('show-only-open-checkbox');
    const nextUpdateCountdownElement = document.getElementById('next-update-countdown'); 

    // Variáveis de estado
    let currentParkDataForRendering = null; 
    let previousRideStatuses = {}; 
    let favorites = JSON.parse(localStorage.getItem('parqueFilasOrlandoFavorites_v3')) || [];
    let activeAlarms = JSON.parse(localStorage.getItem('parqueFilasOrlandoAlarms_v3')) || [];
    let notifyWhenOpenList = JSON.parse(localStorage.getItem('parqueFilasOrlandoNotifyOpen_v3')) || []; 
    let currentParkId = null;
    let rideUpdateInterval = null;
    let countdownInterval = null; 
    const RIDE_UPDATE_INTERVAL_MS = 90000; 

    // --- Funções de Persistência ---
    function saveFavorites() {
        localStorage.setItem('parqueFilasOrlandoFavorites_v3', JSON.stringify(favorites));
    }
    function saveAlarms() {
        localStorage.setItem('parqueFilasOrlandoAlarms_v3', JSON.stringify(activeAlarms));
    }
    function saveNotifyWhenOpen() { 
        localStorage.setItem('parqueFilasOrlandoNotifyOpen_v3', JSON.stringify(notifyWhenOpenList));
    }

    // --- Notificações ---
    function checkNotificationPermission(showButtonIfNeeded = true) {
        if (!('Notification' in window)) {
            console.warn('Este navegador não suporta notificações desktop.');
            notificationPermissionSection.style.display = 'none';
            return 'unsupported';
        }
        if (Notification.permission === 'granted') {
            notificationPermissionSection.style.display = 'none';
            return 'granted';
        }
        if (Notification.permission === 'denied') {
            notificationPermissionSection.innerHTML = '<p>As notificações foram bloqueadas. Altere nas configurações do navegador.</p>';
            notificationPermissionSection.style.display = 'block';
            return 'denied';
        }
        if (showButtonIfNeeded) {
            notificationPermissionSection.style.display = 'block';
        }
        return 'default';
    }
    enableNotificationsBtn.addEventListener('click', async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showPageNotification('Notificações ativadas! 🎉', 'success');
            notificationPermissionSection.style.display = 'none';
        } else if (permission === 'denied') {
            showPageNotification('Notificações bloqueadas. Pode alterar isso nas configurações do navegador.', 'error');
            notificationPermissionSection.innerHTML = '<p>As notificações foram bloqueadas. Altere nas configurações do navegador.</p>';
        } else {
            showPageNotification('Permissão de notificação não concedida.', 'warning');
        }
    });
    function showPageNotification(message, type = 'info') { 
        pageNotificationMessage.textContent = message;
        pageNotificationBanner.className = ''; 
        pageNotificationBanner.classList.add('visible', type);
        
        setTimeout(() => {
            pageNotificationBanner.classList.remove('visible');
        }, 5000);
    }
    closePageNotificationBtn.addEventListener('click', () => {
        pageNotificationBanner.classList.remove('visible');
    });
    function triggerNotification(title, message, icon = './assets/bell-icon.png') { 
        if (Notification.permission === 'granted') {
            if (navigator.serviceWorker.controller) {
                 navigator.serviceWorker.controller.postMessage({
                     type: 'SHOW_NOTIFICATION',
                     payload: { title, options: { body: message, icon: icon, tag: title + message.substring(0,10) } } 
                 });
            } else {
                new Notification(title, { body: message, icon: icon, tag: title + message.substring(0,10) });
            }
        } else {
            showPageNotification(`${title} ${message}`, 'success');
            console.log("Fallback de notificação na página:", title, message);
        }
    }

    // --- Contador de Atualização ---
    function startUpdateCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        let timeLeft = RIDE_UPDATE_INTERVAL_MS / 1000;
        nextUpdateCountdownElement.textContent = timeLeft;

        countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft >= 0) {
                nextUpdateCountdownElement.textContent = timeLeft;
            } else {
                nextUpdateCountdownElement.textContent = 'Atualizando...'; 
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    // --- Lógica Principal da Aplicação ---
    function displayParks() {
        parkListContainer.innerHTML = '';
        rideListSection.style.display = 'none';
        parkListSection.style.display = 'block';
        currentParkDataForRendering = null;
        previousRideStatuses = {}; 
        currentParkId = null;
        selectedParkNameElement.textContent = '';
        if (rideUpdateInterval) clearInterval(rideUpdateInterval);
        if (countdownInterval) clearInterval(countdownInterval); 
        nextUpdateCountdownElement.textContent = '--'; 
        searchRideInput.value = ''; 
        showOnlyOpenCheckbox.checked = false; 

        checkNotificationPermission();

        parks.forEach(park => {
            const parkElement = document.createElement('div');
            parkElement.classList.add('park-item');
            parkElement.innerHTML = `
                <span class="park-item-icon">${park.icon || '❓'}</span>
                <span class="park-item-name">${park.name}</span>
            `;
            parkElement.addEventListener('click', () => {
                currentParkId = park.id;
                fetchAndDisplayRidesForPark(park);
            });
            parkListContainer.appendChild(parkElement);
        });
    }

    async function fetchRidesForPark(parkId) {
        const proxyUrl = `/.netlify/functions/getQueueTimes?parkId=${parkId}`; 

        console.log(`Buscando dados via proxy Netlify: ${proxyUrl}`);
        try {
            const response = await fetch(proxyUrl); 
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: response.statusText || "Falha ao ler resposta do erro do proxy." };
                }
                console.error("Erro da função Netlify:", response.status, errorData);
                throw new Error(`Erro no proxy: ${response.status} - ${errorData.error || 'Erro desconhecido do proxy'}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Erro ao buscar dados das filas via proxy Netlify:", error);
            showPageNotification(`Erro ao buscar filas: ${error.message}. Verifique o console.`, 'error');
            return null;
        }
    }
    
    function processNotificationsForStatusChange(newData, parkId, parkName) {
        if (!newData || !newData.lands || !currentParkDataForRendering || !currentParkDataForRendering.lands) return;

        let newRideStatuses = {};
        newData.lands.forEach(land => {
            if (land.rides) {
                land.rides.forEach(ride => newRideStatuses[ride.id] = ride.is_open);
            }
        });
        
        notifyWhenOpenList.filter(item => item.parkId === parkId).forEach(notifyItem => {
            const previousStatus = previousRideStatuses[notifyItem.rideId];
            const currentStatus = newRideStatuses[notifyItem.rideId];

            if (previousStatus === false && currentStatus === true) { 
                triggerNotification('Atração Aberta!', `${notifyItem.rideName} em ${parkName} acabou de abrir!`, './assets/open-sign-icon.png');
            }
        });
        previousRideStatuses = { ...newRideStatuses };
    }


    function processAlarmsForPark(apiData, parkId, parkName) {
        if (!apiData || !apiData.lands) {
            console.log('[Alarms] Sem dados da API ou lands para processar alarmes.');
            return;
        }
        let allRidesFromApi = [];
        apiData.lands.forEach(land => {
            if (land.rides) allRidesFromApi.push(...land.rides);
        });

        const parkAlarms = activeAlarms.filter(alarm => alarm.parkId === parkId);
        console.log(`[Alarms] Verificando ${parkAlarms.length} alarme(s) para o parque ID ${parkId} (${parkName}). Lista de alarmes ativos:`, JSON.parse(JSON.stringify(activeAlarms)));


        parkAlarms.forEach(alarm => {
            const rideData = allRidesFromApi.find(r => r.id === alarm.rideId);
            console.log(`[Alarms] A verificar alarme para: ${alarm.rideName} (ID da atração: ${alarm.rideId}), Tempo desejado: <= ${alarm.desiredTime} min`);

            if (rideData) {
                console.log(`[Alarms] Dados encontrados para a atração: Nome: ${rideData.name}, Aberta: ${rideData.is_open}, Tempo de Fila: ${rideData.wait_time} min`);
                const conditionMet = rideData.is_open && rideData.wait_time <= alarm.desiredTime;
                console.log(`[Alarms] Atração está aberta? ${rideData.is_open}. Tempo de fila (${rideData.wait_time}) <= Tempo desejado (${alarm.desiredTime})? ${rideData.wait_time <= alarm.desiredTime}. Condição do alarme cumprida: ${conditionMet}`);

                if (conditionMet) {
                    console.log(`[Alarms] ACIONANDO NOTIFICAÇÃO para ${alarm.rideName}`);
                    triggerNotification('Alerta de Fila!',`${alarm.rideName} em ${parkName} está com ${rideData.wait_time} min de espera.`);
                }
            } else {
                console.log(`[Alarms] Não foram encontrados dados na resposta atual da API para o alarme: ${alarm.rideName} (ID da atração: ${alarm.rideId})`);
            }
        });
    }

    async function fetchAndDisplayRidesForPark(park) {
        parkListSection.style.display = 'none';
        rideListSection.style.display = 'block';
        selectedParkNameElement.textContent = park.name;
        rideListContainer.innerHTML = '<p>Carregando atrações... ⏳</p>';
        showAllBtn.classList.add('active');
        showFavoritesBtn.classList.remove('active');
        searchRideInput.value = ''; 
        showOnlyOpenCheckbox.checked = false; 
        previousRideStatuses = {}; 

        if (rideUpdateInterval) clearInterval(rideUpdateInterval);
        if (countdownInterval) clearInterval(countdownInterval);

        const data = await fetchRidesForPark(park.id); 
        if (data) {
            if (data.lands) {
                data.lands.forEach(land => {
                    if (land.rides) {
                        land.rides.forEach(ride => previousRideStatuses[ride.id] = ride.is_open);
                    }
                });
            }
            currentParkDataForRendering = data;
            renderRides(data, false, '', false);
            console.log("[fetchAndDisplayRidesForPark] Chamando processAlarmsForPark com dados iniciais...");
            processAlarmsForPark(data, park.id, park.name);
            startUpdateCountdown(); 

            rideUpdateInterval = setInterval(async () => {
                if (currentParkId === park.id) {
                    console.log(`[Intervalo] Atualizando dados para ${park.name}...`);
                    const updatedData = await fetchRidesForPark(park.id); 
                    if (updatedData) {
                        console.log("[Intervalo] Dados atualizados recebidos:", updatedData);
                        processNotificationsForStatusChange(updatedData, park.id, park.name); 
                        currentParkDataForRendering = updatedData;
                        const showingFavorites = showFavoritesBtn.classList.contains('active');
                        const searchTerm = searchRideInput.value.trim().toLowerCase();
                        const onlyOpen = showOnlyOpenCheckbox.checked;
                        renderRides(updatedData, showingFavorites, searchTerm, onlyOpen);
                        console.log("[Intervalo] Chamando processAlarmsForPark com dados atualizados...");
                        processAlarmsForPark(updatedData, park.id, park.name);
                        startUpdateCountdown(); 
                    }
                } else {
                    clearInterval(rideUpdateInterval);
                    if (countdownInterval) clearInterval(countdownInterval);
                }
            }, RIDE_UPDATE_INTERVAL_MS);
        } else {
             rideListContainer.innerHTML = `<p class="error-message">Não foi possível carregar as atrações para ${park.name}. Tente novamente.</p>`;
        }
    }

    function renderRides(apiData, showOnlyFavorites, searchTerm = '', showOnlyOpen = false) {
        rideListContainer.innerHTML = '';
        let ridesToDisplay = [];

        if (apiData && Array.isArray(apiData.lands)) {
            apiData.lands.forEach(land => {
                if (land && Array.isArray(land.rides)) {
                    land.rides.forEach(ride => {
                        ridesToDisplay.push({ ...ride, parkId: currentParkId, landName: land.name, parkName: parks.find(p=>p.id === currentParkId)?.name });
                    });
                }
            });
        } else {
            console.warn("Estrutura de dados da API inesperada.", apiData);
        }
        
        if (showOnlyOpen) {
            ridesToDisplay = ridesToDisplay.filter(ride => ride.is_open);
        }
        if (showOnlyFavorites) {
            ridesToDisplay = ridesToDisplay.filter(ride => 
                favorites.some(fav => fav.id === ride.id && fav.parkId === currentParkId)
            );
        }
        const normalizedSearchTerm = searchTerm.trim().toLowerCase();
        if (normalizedSearchTerm) {
            ridesToDisplay = ridesToDisplay.filter(ride =>
                ride.name.toLowerCase().includes(normalizedSearchTerm)
            );
        }

        if (ridesToDisplay.length === 0) {
            let message = 'Nenhuma atração encontrada com os filtros aplicados. 🙁';
            if (!showOnlyOpen && !showOnlyFavorites && !normalizedSearchTerm) {
                 message = 'Nenhuma informação de fila disponível para este parque no momento. 🎢';
            } else if (showOnlyFavorites && ridesToDisplay.length === 0 && !showOnlyOpen && !normalizedSearchTerm) { 
                message = 'Nenhuma atração favorita encontrada. ❤️';
            }
            rideListContainer.innerHTML = `<p>${message}</p>`;
            return;
        }
        
        ridesToDisplay.sort((a, b) => a.name.localeCompare(b.name));

        ridesToDisplay.forEach(ride => {
            const isFavorited = favorites.some(fav => fav.id === ride.id && fav.parkId === currentParkId);
            const currentAlarm = activeAlarms.find(alarm => alarm.rideId === ride.id && alarm.parkId === currentParkId);
            const isNotifyWhenOpen = notifyWhenOpenList.some(item => item.rideId === ride.id && item.parkId === currentParkId);

            const rideElement = document.createElement('div');
            rideElement.classList.add('ride-item');
            rideElement.id = `ride-${ride.id}`;
            // CORREÇÃO: Adicionando os emojis de volta ao texto do botão de alarme
            rideElement.innerHTML = `
                <h3>${ride.name}</h3>
                <p><strong>Fila:</strong> ${ride.wait_time !== undefined ? ride.wait_time + ' minutos' : 'N/D'}</p>
                <p><strong>Status:</strong> ${ride.is_open ? 'Aberta ✅' : 'Fechada ❌'}</p>
                <button class="favorite-btn ${isFavorited ? 'favorited' : ''}" data-ride-id="${ride.id}" data-ride-name="${ride.name}"></button>
                
                <div class="notify-open-controls">
                    <input type="checkbox" id="notify-open-${ride.id}" class="notify-open-checkbox" 
                           data-ride-id="${ride.id}" data-ride-name="${ride.name}" data-park-id="${currentParkId}" 
                           ${isNotifyWhenOpen ? 'checked' : ''} ${ride.is_open ? 'disabled' : ''}>
                    <label for="notify-open-${ride.id}">Notificar quando abrir</label>
                    ${isNotifyWhenOpen && !ride.is_open ? '<span class="status">(Ativado)</span>' : ''}
                </div>

                <div class="alarm-controls">
                    <label for="alarm-time-${ride.id}">Alarme em (min):</label>
                    <input type="number" id="alarm-time-${ride.id}" min="0" value="${currentAlarm ? currentAlarm.desiredTime : ''}" ${currentAlarm ? 'disabled' : ''}>
                    <button class="alarm-btn" data-ride-id="${ride.id}" data-ride-name="${ride.name}" data-park-id="${currentParkId}">
                        ${currentAlarm ? 'Remover Alarme ❌' : 'Definir Alarme 🔔'}
                    </button>
                    ${currentAlarm ? `<span class="alarm-status">Alarme para ${currentAlarm.desiredTime} min</span>` : ''}
                </div>
            `;
            rideListContainer.appendChild(rideElement);
        });

        document.querySelectorAll('.favorite-btn').forEach(button => {
            button.removeEventListener('click', handleFavoriteClick); 
            button.addEventListener('click', handleFavoriteClick);
        });
        document.querySelectorAll('.alarm-btn').forEach(button => {
            button.removeEventListener('click', handleAlarmClick);
            button.addEventListener('click', handleAlarmClick);
        });
        document.querySelectorAll('.notify-open-checkbox').forEach(checkbox => { 
            checkbox.removeEventListener('change', handleNotifyWhenOpenChange);
            checkbox.addEventListener('change', handleNotifyWhenOpenChange);
        });
    }

    function handleNotifyWhenOpenChange(event) { 
        const rideId = parseInt(event.target.dataset.rideId);
        const rideName = event.target.dataset.rideName;
        const parkId = parseInt(event.target.dataset.parkId);
        const isChecked = event.target.checked;

        if (isNaN(rideId) || !rideName || isNaN(parkId)) return;

        const notifyIndex = notifyWhenOpenList.findIndex(item => item.rideId === rideId && item.parkId === parkId);

        if (isChecked) { 
            if (notifyIndex === -1) { 
                notifyWhenOpenList.push({ rideId, rideName, parkId });
                showPageNotification(`Notificação ativada para ${rideName} quando abrir.`, 'info');
            }
        } else { 
            if (notifyIndex > -1) {
                notifyWhenOpenList.splice(notifyIndex, 1);
                showPageNotification(`Notificação removida para ${rideName}.`, 'info');
            }
        }
        saveNotifyWhenOpen();
        applyAllFiltersAndRender();
    }


    function handleFavoriteClick(event) {
        const rideId = parseInt(event.target.dataset.rideId);
        const rideName = event.target.dataset.rideName;
        if (isNaN(rideId) || !rideName || currentParkId === null) return;
        const favoriteIndex = favorites.findIndex(fav => fav.id === rideId && fav.parkId === currentParkId);
        if (favoriteIndex > -1) {
            favorites.splice(favoriteIndex, 1);
            event.target.classList.remove('favorited');
        } else {
            favorites.push({ id: rideId, name: rideName, parkId: currentParkId });
            event.target.classList.add('favorited');
        }
        saveFavorites();
        applyAllFiltersAndRender(); 
    }

    function handleAlarmClick(event) {
        const rideId = parseInt(event.target.dataset.rideId);
        const rideName = event.target.dataset.rideName;
        const parkId = parseInt(event.target.dataset.parkId);
        const timeInput = document.getElementById(`alarm-time-${rideId}`); 
        if (isNaN(rideId) || !rideName || isNaN(parkId)) return;
        const alarmIndex = activeAlarms.findIndex(a => a.rideId === rideId && a.parkId === parkId);
        if (alarmIndex > -1) {
            activeAlarms.splice(alarmIndex, 1);
            showPageNotification(`Alarme removido para ${rideName}.`, 'info');
        } else {
            if (!timeInput) {
                console.error(`Elemento input para alarme da atração ID ${rideId} não encontrado.`);
                showPageNotification('Erro ao tentar definir o alarme. Elemento não encontrado.', 'error');
                return;
            }
            const desiredTime = parseInt(timeInput.value);
            if (isNaN(desiredTime) || desiredTime < 0) {
                showPageNotification('Por favor, insira um tempo válido para o alarme.', 'warning');
                return;
            }
            activeAlarms.push({ rideId, rideName, parkId, desiredTime, parkName: parks.find(p=>p.id === parkId)?.name });
            showPageNotification(`Alarme definido para ${rideName} em ${desiredTime} min.`, 'success');
        }
        saveAlarms(); 
        applyAllFiltersAndRender(); 
    }
    
    function applyAllFiltersAndRender() {
        if (currentParkDataForRendering) {
            const showingFavorites = showFavoritesBtn.classList.contains('active');
            const searchTerm = searchRideInput.value.trim().toLowerCase();
            const onlyOpen = showOnlyOpenCheckbox.checked;
            renderRides(currentParkDataForRendering, showingFavorites, searchTerm, onlyOpen);
        }
    }

    showAllBtn.addEventListener('click', () => {
        showAllBtn.classList.add('active');
        showFavoritesBtn.classList.remove('active');
        applyAllFiltersAndRender();
    });
    showFavoritesBtn.addEventListener('click', () => {
        showAllBtn.classList.remove('active');
        showFavoritesBtn.classList.add('active');
        applyAllFiltersAndRender();
    });
    searchRideInput.addEventListener('input', applyAllFiltersAndRender);
    showOnlyOpenCheckbox.addEventListener('change', applyAllFiltersAndRender);
    backToParksButton.addEventListener('click', displayParks);

    // Inicialização
    checkNotificationPermission();
    displayParks();
});
