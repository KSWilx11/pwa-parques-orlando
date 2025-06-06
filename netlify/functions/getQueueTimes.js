    // netlify/functions/getQueueTimes.js
    // Usaremos 'node-fetch' versão 2 para compatibilidade com o 'require' padrão do Netlify Functions
    // Certifique-se de ter "node-fetch": "^2.6.1" no seu package.json

    const fetch = require('node-fetch');

    exports.handler = async function(event, context) {
        // 'event.queryStringParameters' contém os parâmetros da URL
        const parkId = event.queryStringParameters.parkId;

        if (!parkId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'O parâmetro parkId é obrigatório.' })
            };
        }

        const API_ENDPOINT = `https://queue-times.com/parks/${parkId}/queue_times.json`;
        console.log(`[Netlify Function] Chamando API externa: ${API_ENDPOINT}`);

        try {
            const response = await fetch(API_ENDPOINT);
            const data = await response.json(); // Tenta sempre converter para JSON para ver a resposta da API

            if (!response.ok) {
                console.error(`[Netlify Function] Erro da API externa: ${response.status}`, data);
                // Retorna o mesmo status de erro da API externa e a mensagem de erro dela, se houver
                return {
                    statusCode: response.status,
                    body: JSON.stringify({ 
                        error: `Erro ao buscar dados da API externa: ${response.statusText}`,
                        apiResponse: data // Inclui a resposta da API externa no erro para depuração
                    })
                };
            }
            
            console.log(`[Netlify Function] Dados recebidos com sucesso da API externa para parkId: ${parkId}`);
            // O Netlify lida automaticamente com os cabeçalhos CORS para funções
            // quando acedidas a partir do mesmo site Netlify.
            return {
                statusCode: 200,
                // headers: { 'Content-Type': 'application/json' }, // O Netlify define isto automaticamente para JSON
                body: JSON.stringify(data)
            };
        } catch (error) {
            console.error("[Netlify Function] Erro interno ao processar o pedido proxy:", error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Erro interno no servidor proxy.', details: error.message })
            };
        }
    };
    