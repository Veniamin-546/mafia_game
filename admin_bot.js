const fetch = require('node-fetch');
const { io } = require("socket.io-client");

const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; 
const ADMIN_TG_ID = 927590102; 
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; 

let stats = {
    uniqueUsers: new Set(),
    revenue: 0,
    gamesPlayed: 0,
    history: []
};

// 1. ОЧИСТКА WEBHOOK (КРИТИЧЕСКИ ВАЖНО)
async function setupBot() {
    console.log("--- ЗАПУСК АДМИН-БОТА ---");
    try {
        // Удаляем вебхук, чтобы работал long polling (getUpdates)
        const res = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
        const data = await res.json();
        console.log("Статус сброса Telegram:", data.description);
        
        // Тестовое сообщение самому себе в консоль
        console.log("Ожидаю сообщений от ID:", ADMIN_TG_ID);
    } catch (e) {
        console.error("Ошибка при настройке:", e);
    }
}

// 2. СВЯЗЬ С СЕРВЕРОМ
const socket = io(SERVER_URL);
socket.on("connect", () => {
    console.log("✅ Соединение с игровым сервером установлено!");
});

socket.on("admin_stat_update", (data) => {
    if (data.type === 'new_user') stats.uniqueUsers.add(data.userId);
    if (data.type === 'payment') {
        stats.revenue += (parseInt(data.amount) || 0);
        sendAdminMsg(`💰 ДОНАТ: +${data.amount} XTR от ${data.name}`);
    }
    if (data.type === 'game_over') stats.gamesPlayed++;
});

// 3. ОТПРАВКА СООБЩЕНИЙ
async function sendAdminMsg(text) {
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_TG_ID, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) { console.log("Ошибка отправки сообщения в TG"); }
}

// 4. ПРОВЕРКА КОМАНД (POLLING)
let lastUpdateId = 0;
async function poll() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                
                if (update.message) {
                    const fromId = update.message.from.id;
                    const text = update.message.text;

                    console.log(`Получено сообщение от ${fromId}: ${text}`);

                    if (fromId === ADMIN_TG_ID) {
                        if (text === '/start' || text === '/stats') {
                            const report = `📊 **МАФИЯ: СТАТИСТИКА**\n\n` +
                                `👥 Игроков: ${stats.uniqueUsers.size}\n` +
                                `🎮 Игр: ${stats.gamesPlayed}\n` +
                                `💰 Доход: ${stats.revenue} XTR\n\n` +
                                `🌐 Сервер: ${socket.connected ? '✅ ОНЛАЙН' : '❌ ОФФЛАЙН'}`;
                            await sendAdminMsg(report);
                        }
                    } else {
                        console.log("⚠️ Сообщение проигнорировано (не ваш ID)");
                    }
                }
            }
        }
    } catch (e) { console.log("Ошибка сети в poll"); }
    setTimeout(poll, 1000);
}

// ЗАПУСК ВСЕГО
setupBot().then(() => poll());
