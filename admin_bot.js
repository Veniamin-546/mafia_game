const fetch = require('node-fetch');
const { io } = require("socket.io-client");

// --- НАСТРОЙКИ ---
const ADMIN_BOT_TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; 
const SERVER_URL = "https://mafia-game-skw7.onrender.com/"; 

let stats = {
    uniqueUsers: new Set(),
    revenue: 0,
    gamesPlayed: 0,
    history: []
};

// 1. ОЧИСТКА WEBHOOK И ЗАПУСК
async function setupBot() {
    console.log("--- СИСТЕМА МОНИТОРИНГА ЗАПУЩЕНА ---");
    try {
        const res = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
        const data = await res.json();
        console.log("Статус связи с TG:", data.ok ? "✅ ОК" : "❌ Ошибка");
        console.log("Ожидаю сообщений в Telegram...");
    } catch (e) {
        console.error("Ошибка сети при запуске:", e.message);
    }
}

// 2. СВЯЗЬ С ИГРОВЫМ СЕРВЕРОМ
const socket = io(SERVER_URL);
socket.on("connect", () => {
    console.log("✅ Соединение с Mafia Server: УСТАНОВЛЕНО");
});
socket.on("connect_error", (err) => {
    console.log("❌ Ошибка подключения к серверу:", err.message);
});

socket.on("admin_stat_update", (data) => {
    console.log("📩 Получены данные от сервера:", data);
    if (data.type === 'new_user') stats.uniqueUsers.add(data.userId);
    if (data.type === 'payment') stats.revenue += (parseInt(data.amount) || 0);
    if (data.type === 'game_over') stats.gamesPlayed++;
});

// 3. ФУНКЦИЯ ОТВЕТА
async function sendReply(chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
        console.log(`✅ Ответ отправлен в чат: ${chatId}`);
    } catch (e) {
        console.log("❌ Не удалось отправить сообщение в TG");
    }
}

// 4. ГЛАВНЫЙ ЦИКЛ (ОПРОС ТЕЛЕГРАМА)
let lastUpdateId = 0;
async function poll() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
        const data = await response.json();
        
        if (data.ok && data.result && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                
                if (update.message) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text;

                    // ВЫВОД В КОНСОЛЬ ДЛЯ ПРОВЕРКИ
                    console.log(`🔔 СООБЩЕНИЕ ИЗ TG: "${text}" от чата ${chatId}`);

                    if (text === '/start' || text === '/stats') {
                        const report = `📊 **ОТЧЕТ ДЛЯ АДМИНА**\n\n` +
                            `👥 Игроков: ${stats.uniqueUsers.size}\n` +
                            `🎮 Игр: ${stats.gamesPlayed}\n` +
                            `💰 Доход: ${stats.revenue} XTR\n\n` +
                            `🌐 Сервер: ${socket.connected ? '✅ ОНЛАЙН' : '❌ ОФФЛАЙН'}`;
                        await sendReply(chatId, report);
                    }
                }
            }
        }
    } catch (e) {
        console.log("... поиск обновлений ...");
    }
    setTimeout(poll, 1000);
}

setupBot().then(() => poll());
