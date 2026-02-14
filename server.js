const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch'); // Установи через npm install node-fetch

// --- НАСТРОЙКИ БОТА ---
const BOT_TOKEN = '8577050382:AAHOorg_1VdNppZJYkWSqscIl8d1GVeZkbM'; // ВСТАВЬ СВОЙ ТОКЕН ТУТ

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_SUPREME_ENGINE_RUNNING');
});

const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- ЛОГИКА ОПЛАТЫ TELEGRAM STARS ---
    socket.on('create_invoice', async (data) => {
        try {
            const { type, amount } = data; // type: 'vip' или 'mafia_luck'
            
            // Формируем описание товара
            const title = type === 'vip' ? "👑 PREMIUM VIP" : "🔪 ШАНС МАФИИ";
            const description = type === 'vip' 
                ? "Золотой статус, уникальная иконка и приоритет в очереди." 
                : "Увеличивает шанс получить роль Мафии на 80%.";

            // Генерация Invoice Link через Telegram API
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    description: description,
                    payload: `payment_${type}_${socket.id}`, // Технические данные платежа
                    provider_token: "", // Для Stars поле пустое
                    currency: "XTR", // Валюта - Telegram Stars
                    prices: [{ label: "⭐ Stars", amount: amount }]
                })
            });

            const result = await response.json();

            if (result.ok) {
                // Отправляем ссылку на оплату обратно клиенту
                socket.emit('invoice_ready', { url: result.result });
            } else {
                console.error('Bot API Error:', result);
                socket.emit('sys_msg', 'Ошибка при создании платежа. Попробуйте позже.');
            }
        } catch (error) {
            console.error('Payment Crash:', error);
        }
    });

    // --- ЛОГИКА ИГРЫ И ПОДБОРА ---
    socket.on('join_queue', (userData) => {
        socket.userData = userData; 
        if (!queue.find(s => s.id === socket.id)) {
            queue.push(socket);
        }
        
        io.emit('queue_size', queue.length);

        if (queue.length >= 2) {
            const players = [queue.shift(), queue.shift()];
            const roomId = `room_${Date.now()}`;
            
            // Сортировка по купленным шансам (у кого больше mafiaLuck, тот мафия)
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            const mafia = players[0];
            const others = players.filter(p => p.id !== mafia.id);
            const comm = others.length > 0 ? others[0] : null;

            rooms[roomId] = {
                players: players.map(p => p.id),
                phase: 'night',
                votes: {},
                actionsDone: 0
            };

            players.forEach(p => {
                p.join(roomId);
                p.roomId = roomId;
                p.role = (p.id === mafia.id) ? 'mafia' : (comm && p.id === comm.id ? 'comm' : 'citizen');
                p.isAlive = true;

                p.emit('start_game', {
                    room: roomId,
                    role: p.role,
                    myId: p.id,
                    players: players.map(pl => ({ 
                        id: pl.id, 
                        name: pl.userData.name, 
                        isVip: pl.userData.isVip,
                        vipIcon: pl.userData.vipIcon 
                    }))
                });
            });
        }
    });

    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'night') return;

        if (socket.role === 'mafia') {
            if (data.action === 'kill') {
                io.to(socket.roomId).emit('game_event', { 
                    type: 'attack', 
                    victimId: data.targetId, 
                    victimName: data.targetName 
                });
            } else {
                socket.emit('sys_msg', 'Вы затаились. Проверки не обнаружат вас.');
            }
            // Переключаем фазу
            room.phase = 'day';
            io.to(socket.roomId).emit('change_phase', 'day');
        }

        if (socket.role === 'comm' && data.action === 'check') {
            // Ищем сокет цели
            const targetSocket = [...io.sockets.sockets.values()].find(s => s.id === data.targetId);
            const isMafia = targetSocket && targetSocket.role === 'mafia';
            socket.emit('sys_msg', `Результат: ${data.targetName} - ${isMafia ? 'МАФИЯ 🚩' : 'МИРНЫЙ ✅'}`);
        }
    });

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            io.to(socket.roomId).emit('sys_msg', `Голосование принято.`);
            
            if (Object.keys(room.votes).length >= 1) { 
                room.phase = 'night';
                room.votes = {};
                io.to(socket.roomId).emit('change_phase', 'night');
            }
        }
    });

    socket.on('send_msg', (msg) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('new_msg', {
                user: socket.userData.name,
                text: msg,
                isVip: socket.userData.isVip,
                vipIcon: socket.userData.vipIcon
            });
        }
    });

    socket.on('disconnect', () => {
        queue = queue.filter(s => s.id !== socket.id);
        io.emit('queue_size', queue.length);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
