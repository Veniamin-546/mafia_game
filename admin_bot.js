const fetch = require('node-fetch');
const { io } = require("socket.io-client");

// --- НАСТРОЙКИ ---
const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; 
const ADMIN_TG_ID = 927590102; 
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; 

let stats = {
    uniqueUsers: new Set(),
    revenue: 0,
    gamesPlayed: 0,
    history: []
};

// Функция принудительного сброса Webhook (ЧТОБЫ БОТ НАЧАЛ ОТВЕЧАТЬ)
async function resetWebhook() {
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
        console.log("✅ Webhook сброшен. Бот теперь должен видеть сообщения.");
    } catch (e) { console.error("Ошибка сброса:", e); }
}

const socket = io(SERVER_URL);

socket.on("connect", () => {
    console.log("✅ Бот статистики подключен к серверу Mafia Supreme");
    sendAdminMsg("🚀 **Бот статистики онлайн!**\nСвязь с сервером установлена.\nНапиши /stats");
});

socket.on("admin_stat_update", (data) => {
    if (data.type === 'new_user') {
        stats.uniqueUsers.add(data.userId);
        addLog(`👤 Новый игрок: ${data.name || 'ID ' + data.userId}`);
    }
    if (data.type === 'payment') {
        const amount = parseInt(data.amount) || 0;
        stats.revenue += amount;
        sendAdminMsg(`💰 **ДОНАТ:** +${amount} XTR от ${data.name}\nТовар: ${data.item}`);
        addLog(`💎 Донат: +${amount} XTR (${data.item})`);
    }
    if (data.type === 'game_over') {
        stats.gamesPlayed++;
        addLog(`🎭 Игра окончена. Победили: ${data.winner}`);
    }
});

function addLog(msg) {
    const time = new Date().toLocaleTimeString('ru-RU');
    stats.history.push(`[${time}] ${msg}`);
    if (stats.history.length > 10) stats.history.shift();
}

async function sendAdminMsg(text) {
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_TG_ID, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) {}
}

let lastUpdateId = 0;
async function poll() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
        const data = await response.json();
        
        if (data.ok && data.result) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message && update.message.from.id === ADMIN_TG_ID) {
                    const text = update.message.text;

                    if (text === '/start' || text === '/stats') {
                        const report = `📊 **МАФИЯ: СТАТИСТИКА**\n\n` +
                            `👥 Игроков: ${stats.uniqueUsers.size}\n` +
                            `🎮 Игр: ${stats.gamesPlayed}\n` +
                            `💰 Доход: ${stats.revenue} XTR\n\n` +
                            `🌐 Сервер: ${socket.connected ? '✅ ОНЛАЙН' : '❌ ОФФЛАЙН'}\n\n` +
                            `📜 **ЛОГИ:**\n${stats.history.join('\n') || 'Нет данных'}`;
                        sendAdminMsg(report);
                    }
                }
            }
        }
    } catch (e) {}
    setTimeout(poll, 1500);
}

// ЗАПУСК
resetWebhook().then(() => poll());
