const fetch = require('node-fetch');
const { io } = require("socket.io-client");

// --- НАСТРОЙКИ (ЗАПОЛНИ ИХ) ---
const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; // Твой Токен
const ADMIN_TG_ID = 927590102; // Твой ID
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; // URL сервера

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
    sendAdminMsg("🚀 **Бот статистики запущен и подключен к движку!**\nНапиши /stats для проверки.");
});

// Слушаем обновления от сервера
socket.on("admin_stat_update", (data) => {
    if (data.type === 'new_user') {
        stats.uniqueUsers.add(data.userId);
        addLog(`👤 Новый юзер: ${data.name || 'Аноним'}`);
    }
    if (data.type === 'payment') {
        const amount = parseInt(data.amount) || 0;
        stats.revenue += amount;
        sendAdminMsg(`💰 **Дзинь! Новый донат:**\n+${amount} XTR от ${data.name}\nТовар: ${data.item}`);
        addLog(`💎 Донат: +${amount} XTR (${data.item})`);
    }
    if (data.type === 'game_over') {
        stats.gamesPlayed++;
        addLog(`🎭 Игра завершена: Победили ${data.winner}`);
    }
});

// Вспомогательная функция для истории
function addLog(msg) {
    const time = new Date().toLocaleTimeString('ru-RU');
    stats.history.push(`[${time}] ${msg}`);
    if (stats.history.length > 10) stats.history.shift(); // Увеличил до 10 для удобства
}

async function sendAdminMsg(text) {
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_TG_ID, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) { console.error("Ошибка отправки админу:", e); }
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
                    const text = update.message.text;

                    if (text === '/start' || text === '/stats') {
                        const report = `📊 **СТАТИСТИКА MAFIA SUPREME**\n\n` +
                            `👥 Всего игроков: ${stats.uniqueUsers.size}\n` +
                            `🎮 Сыграно партий: ${stats.gamesPlayed}\n` +
                            `💰 Общая выручка: ${stats.revenue} XTR\n\n` +
                            `📜 **ПОСЛЕДНИЕ СОБЫТИЯ:**\n${stats.history.join('\n') || 'Пока нет событий'}\n\n` +
                            `🚀 Статус связи: ${socket.connected ? '✅ Подключен' : '❌ Нет связи с сервером'}`;
                        sendAdminMsg(report);
                    }

                    // ДОБАВИЛ ТЕСТОВУЮ КОМАНДУ, ЧТОБЫ ТЫ МОГ ПРОВЕРИТЬ БОТА
                    if (text === '/test') {
                        stats.uniqueUsers.add(12345);
                        stats.revenue += 50;
                        addLog("Тестовое событие добавлено");
                        sendAdminMsg("✅ Тест пройден! Я работаю. Теперь жду данные от основного сервера.");
                    }
                }
            }
        }
    } catch (e) {}
    setTimeout(poll, 1500);
}
poll();
