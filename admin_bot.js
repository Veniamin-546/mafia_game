const fetch = require('node-fetch');
const { io } = require("socket.io-client");

// --- НАСТРОЙКИ (ЗАПОЛНИ ИХ) ---
const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; // Токен из @BotFather
const ADMIN_TG_ID = 927590102; // Твой ID
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; // Если деплоишь, замени на URL своего сервера (например https://mygame.render.com)

let stats = {
    uniqueUsers: new Set(),
    revenue: 0,
    gamesPlayed: 0,
    history: []
};

// Подключение к основному движку
const socket = io(SERVER_URL);

socket.on("connect", () => {
    console.log("✅ Бот статистики подключен к серверу Mafia Supreme");
});

// Слушаем обновления от сервера
socket.on("admin_stat_update", (data) => {
    if (data.type === 'new_user') {
        stats.uniqueUsers.add(data.userId);
    }
    if (data.type === 'payment') {
        stats.revenue += data.amount;
        sendAdminMsg(`💰 **Дзинь! Новый донат:**\n+${data.amount} XTR от ${data.name}\nТовар: ${data.item}`);
    }
    if (data.type === 'game_over') {
        stats.gamesPlayed++;
    }
});

async function sendAdminMsg(text) {
    await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_TG_ID, text: text, parse_mode: 'Markdown' })
    });
}

// Команды в Телеграм
let lastUpdateId = 0;
async function poll() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
        const data = await response.json();
        if (data.ok && data.result) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message && update.message.from.id === ADMIN_TG_ID) {
                    if (update.message.text === '/start' || update.message.text === '/stats') {
                        const report = `📊 **СТАТИСТИКА MAFIA SUPREME**\n\n` +
                            `👥 Всего игроков: ${stats.uniqueUsers.size}\n` +
                            `🎮 Сыграно партий: ${stats.gamesPlayed}\n` +
                            `💰 Общая выручка: ${stats.revenue} XTR\n\n` +
                            `🚀 Сервер работает исправно!`;
                        sendAdminMsg(report);
                    }
                }
            }
        }
    } catch (e) {}
    setTimeout(poll, 1500);
}
poll();
