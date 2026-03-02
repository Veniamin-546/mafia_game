const fetch = require('node-fetch');

// --- ТВОИ НАСТРОЙКИ ---
const TOKEN = '8120502262:AAF8ZMTCOwX9jZ63FhFJjc3Rw3T7dY3f6h0'; 

// Переменные для хранения статистики (пока в памяти бота)
let stats = {
    totalUsers: 0,
    totalDonations: 0,
    activeGames: 0
};

// 1. ФУНКЦИЯ ОТПРАВКИ СООБЩЕНИЯ
async function sendMessage(chatId, text) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        })
    });
}

// 2. ГЛАВНАЯ ИНСТРУКЦИЯ (МЕНЮ)
const mainInstruction = `
🛠 **ПАНЕЛЬ УПРАВЛЕНИЯ MAFIA ADM**

Выбери команду для получения данных:

📊 /stats — Показать общую статистику (Юзеры, Донаты, Игры)
💰 /money — Посмотреть только финансовый отчет
🎮 /games — Статус игровых комнат
🔑 /admin — Инструкция по админ-командам (будет позже)

_Бот готов к работе. Просто напиши команду._
`;

// 3. ЦИКЛ ПРОВЕРКИ СООБЩЕНИЙ (POLLING)
let lastUpdateId = 0;

async function startBot() {
    console.log("🚀 Админ-бот запущен...");
    
    // Сброс вебхука, чтобы сообщения точно доходили
    await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true`);

    setInterval(async () => {
        try {
            const response = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
            const data = await response.json();

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;
                    
                    if (update.message && update.message.text) {
                        const chatId = update.message.chat.id;
                        const text = update.message.text;

                        console.log(`📩 Пришло сообщение: ${text}`);

                        // ЛОГИКА ОТВЕТОВ
                        if (text === '/start') {
                            await sendMessage(chatId, "👋 Привет! Я твой админ-бот по логистике и статистике.\n" + mainInstruction);
                        } 
                        else if (text === '/stats') {
                            await sendMessage(chatId, `📊 **ОБЩАЯ СТАТИСТИКА**\n\n👤 Игроков: ${stats.totalUsers}\n💰 Донатов: ${stats.totalDonations} XTR\n🎮 Игр: ${stats.activeGames}`);
                        }
                        else if (text === '/money') {
                            await sendMessage(chatId, `💰 **ФИНАНСОВЫЙ ОТЧЕТ**\n\nВсего получено: ${stats.totalDonations} XTR\nСтатус платежной системы: ✅ OK`);
                        }
                        else {
                            await sendMessage(chatId, "❓ Неизвестная команда. Используй /start для вызова меню.");
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Ошибка при получении сообщений:", e.message);
        }
    }, 2000); // Проверяет новые сообщения каждые 2 секунды
}

startBot();
