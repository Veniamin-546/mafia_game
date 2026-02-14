const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch'); // Установи через npm install node-fetch

// --- НАСТРОЙКИ БОТА ---
const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ОТ_BOTFATHER'; // ВСТАВЬ СВОЙ ТОКЕН ТУТ

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_SUPREME_ENGINE_RUNNING');
});

const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- ЛОГИКА ОПЛАТЫ TELEGRAM STARS (ОБНОВЛЕННАЯ) ---
    socket.on('create_invoice', async (data) => {
        try {
            const { type, amount } = data; 
            
            let title = "";
            let description = "";

            // Новая логика распределения тарифов
            if (type.startsWith('vip')) {
                title = "👑 PREMIUM VIP";
                const period = type === 'vip_1y' ? "год" : (type === 'vip_4m' ? "4 месяца" : "1 месяц");
                description = `Золотой статус на ${period}, уникальная иконка и приоритет в чате.`;
            } else if (type === 'luck_c') {
                title = "🔍 ШАНС КОМИССАРА";
                description = "Увеличивает шанс получить роль Комиссара на 80%.";
            } else if (type === 'luck_m') {
                title = "🔪 ШАНС МАФИИ";
                description = "Увеличивает шанс получить роль Мафии на 80%.";
            }

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    description: description,
                    payload: `payment_${type}_${socket.id}`,
                    provider_token: "", 
                    currency: "XTR", 
                    prices: [{ label: "⭐ Stars", amount: amount }]
                })
            });

            const result = await response.json();

            if (result.ok) {
                socket.emit('invoice_ready', { url: result.result, type: type });
            } else {
                console.error('Bot API Error:', result);
                socket.emit('sys_msg', 'Ошибка при создании платежа.');
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
            
            // 1. Сортировка для выбора Мафии
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            const mafiaSocket = players[0];
            
            // 2. Сортировка оставшихся для выбора Комиссара
            const remaining = players.filter(p => p.id !== mafiaSocket.id);
            remaining.sort((a, b) => (b.userData.commLuck || 0) - (a.userData.commLuck || 0));
            const commSocket = remaining[0];

            rooms[roomId] = {
                players: players.map(p => p.id),
                phase: 'night',
                votes: {},
                actionsDone: 0,
                aliveCount: players.length
            };

            players.forEach(p => {
                p.join(roomId);
                p.roomId = roomId;
                p.isAlive = true;

                if (p.id === mafiaSocket.id) {
                    p.role = 'mafia';
                } else if (commSocket && p.id === commSocket.id) {
                    p.role = 'comm';
                } else {
                    p.role = 'citizen';
                }

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
                const targetSocket = [...io.sockets.sockets.values()].find(s => s.id === data.targetId);
                if (targetSocket) {
                    targetSocket.isAlive = false;
                    room.aliveCount--;
                }
                
                io.to(socket.roomId).emit('game_event', { 
                    type: 'attack', 
                    victimId: data.targetId, 
                    victimName: data.targetName 
                });
                
                // Проверка на победу Мафии после убийства
                checkWinCondition(socket.roomId);
            }
            
            room.phase = 'day';
            io.to(socket.roomId).emit('change_phase', 'day');
        }

        if (socket.role === 'comm' && data.action === 'check') {
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
                const targetSocket = [...io.sockets.sockets.values()].find(s => s.id === targetId);
                if (targetSocket) {
                    targetSocket.isAlive = false;
                    room.aliveCount--;
                    io.to(socket.roomId).emit('sys_msg', `Игрок ${targetSocket.userData.name} был казнен.`);
                }

                // Проверка на победу после казни
                if (!checkWinCondition(socket.roomId)) {
                    room.phase = 'night';
                    room.votes = {};
                    io.to(socket.roomId).emit('change_phase', 'night');
                }
            }
        }
    });

    // --- ФУНКЦИЯ ПРОВЕРКИ ПОБЕДЫ ---
    function checkWinCondition(roomId) {
        const room = rooms[roomId];
        const playersInRoom = [...io.sockets.sockets.values()].filter(s => s.roomId === roomId);
        
        const mafiaAlive = playersInRoom.some(p => p.role === 'mafia' && p.isAlive);
        const citizensAlive = playersInRoom.some(p => p.role !== 'mafia' && p.isAlive);

        if (!mafiaAlive) {
            io.to(roomId).emit('game_over', { winner: 'citizens' });
            delete rooms[roomId];
            return true;
        } else if (!citizensAlive) {
            io.to(roomId).emit('game_over', { winner: 'mafia' });
            delete rooms[roomId];
            return true;
        }
        return false;
    }

    socket.on('send_msg', (msg) => {
        if (socket.roomId && socket.isAlive) { // Мертвые не пишут
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
        // Очистка комнаты если игрок вышел (опционально)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
