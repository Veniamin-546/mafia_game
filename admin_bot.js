const fetch = require('node-fetch');
const { io } = require("socket.io-client");

// --- НАСТРОЙКИ ---
const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; 
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; 

let stats = {
    uniqueUsers: new Set(),
    revenue: 0,
    gamesPlayed: 0
};

// 1. ПРИНУДИТЕЛЬНАЯ ОЧИСТКА И ПРОВЕРКА ТОКЕНА
async function init() {
    console.log("🚀 Запуск диагностики бота...");
    try {
        // Проверяем, живой ли токен вообще
        const meRes = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getMe`);
        const meData = await meRes.json();
        
        if (!meData.ok) {
            console.log("❌ ОШИБКА: Токен неверный! Проверь его в @BotFather.");
            return;
        }
        console.log(`✅ Токен принят. Имя бота: @${meData.result.username}`);

        // Удаляем вебхук (очищаем путь для сообщений)
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
        console.log("✅ Вебхук удален. Теперь Telegram будет присылать сообщения в этот код.");
        
        poll(); // Запускаем опрос только после очистки
    } catch (e) {
        console.error("❌ Ошибка инициализации:", e.message);
    }
}

// 2. СВЯЗЬ С СЕРВЕРОМ
const socket = io(SERVER_URL);
socket.on("connect", () => console.log("🌐 Подключено к игровому серверу!"));

socket.on("admin_stat_update", (data) => {
    if (data.type === 'new_user') stats.uniqueUsers.add(data.userId);
    if (data.type === 'payment') stats.revenue += (Number(data.amount) || 0);
    if (data.type === 'game_over') stats.gamesPlayed++;
});

// 3. ЦИКЛ ОПРОСА (LONG POLLING)
let lastUpdateId = 0;
async function poll() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text;

                    console.log(`📩 НОВОЕ СООБЩЕНИЕ: [${chatId}] ${text}`);

                    // Отвечаем на ЛЮБОЕ сообщение, чтобы проверить связь
                    const report = `📊 **СТАТИСТИКА БОТА**\n\n` +
                        `👤 Игроков: ${stats.uniqueUsers.size}\n` +
                        `🎮 Игр: ${stats.gamesPlayed}\n` +
                        `💰 Доход: ${stats.revenue} XTR\n\n` +
                        `🔗 Сервер: ${socket.connected ? '✅ Ок' : '❌ Оффлайн'}`;

                    await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, text: report, parse_mode: 'Markdown' })
                    });
                }
            }
        }
    } catch (e) {
        // Ошибки сети игнорируем, просто пробуем снова
    }
    setTimeout(poll, 1000);
}

init();
