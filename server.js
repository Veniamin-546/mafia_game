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

// Порядок ходов ночью
const NIGHT_ORDER = ['mafia', 'comm', 'doc'];

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- ЛОГИКА ОПЛАТЫ TELEGRAM STARS (ОБНОВЛЕННАЯ) ---
    socket.on('create_invoice', async (data) => {
        try {
            const { type, amount } = data; 
            
            let title = "";
            let description = "";

            // Исправлено: теперь сервер распознает все типы из твоего магазина
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
                // Возвращаем ссылку клиенту
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
            
            // Сортировка по шансам
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            const mafiaSocket = players[0];
            
            const remaining = players.filter(p => p.id !== mafiaSocket.id);
            remaining.sort((a, b) => (b.userData.commLuck || 0) - (a.userData.commLuck || 0));
            const commSocket = remaining[0];
            
            // Если игроков больше 3, можно добавить доктора (для 2 игроков пока только Мафия/Ком)
            const docSocket = remaining.length > 1 ? remaining[1] : null;

            rooms[roomId] = {
                players: players.map(p => p.id),
                phase: 'night',
                activeRole: 'mafia', // Ночь всегда начинает мафия
                nightActions: { killId: null, saveId: null }, 
                votes: {},
                aliveCount: players.length
            };

            players.forEach(p => {
                p.join(roomId);
                p.roomId = roomId;
                p.isAlive = true;

                if (p.id === mafiaSocket.id) p.role = 'mafia';
                else if (commSocket && p.id === commSocket.id) p.role = 'comm';
                else if (docSocket && p.id === docSocket.id) p.role = 'doc';
                else p.role = 'citizen';

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
                
                // Сразу уведомляем мафию, что сейчас её ход
                if (p.role === 'mafia') {
                    p.emit('sys_msg', '🌙 Наступила ночь. Ваш ход, Мафия!');
                }
            });
        }
    });

    // --- ПООЧЕРЕДНЫЕ ХОДЫ НОЧЬЮ ---
    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'night') return;
        if (socket.role !== room.activeRole) return; // Проверка очереди

        // Записываем действие
        if (socket.role === 'mafia' && data.action === 'kill') {
            room.nightActions.killId = data.targetId;
            room.nightActions.victimName = data.targetName;
        }
        
        if (socket.role === 'comm' && data.action === 'check') {
            const target = [...io.sockets.sockets.values()].find(s => s.id === data.targetId);
            const isMafia = target && target.role === 'mafia';
            socket.emit('sys_msg', `🔍 Результат проверки: ${data.targetName} - ${isMafia ? 'МАФИЯ' : 'МИРНЫЙ'}`);
        }

        if (socket.role === 'doc' && data.action === 'heal') {
            room.nightActions.saveId = data.targetId;
        }

        // Переходим к следующему игроку в очереди
        advanceNightTurn(socket.roomId);
    });

    function advanceNightTurn(roomId) {
        const room = rooms[roomId];
        const currentIndex = NIGHT_ORDER.indexOf(room.activeRole);
        
        if (currentIndex < NIGHT_ORDER.length - 1) {
            // Переходим к следующей роли
            room.activeRole = NIGHT_ORDER[currentIndex + 1];
            
            // Проверяем, есть ли такой живой игрок в комнате
            const nextPlayer = [...io.sockets.sockets.values()].find(s => 
                s.roomId === roomId && s.role === room.activeRole && s.isAlive
            );

            if (nextPlayer) {
                io.to(roomId).emit('sys_msg', `Ход роли: ${room.activeRole}...`);
                nextPlayer.emit('sys_msg', '🌙 Теперь ваш черед действовать!');
                // Отправляем сигнал фронтенду обновить UI для этой роли
                io.to(roomId).emit('change_phase', { phase: 'night', activeRole: room.activeRole });
            } else {
                // Если игрока нет, прыгаем дальше
                advanceNightTurn(roomId);
            }
        } else {
            // Все сходили, подводим итоги
            finishNight(roomId);
        }
    }

    function finishNight(roomId) {
        const room = rooms[roomId];
        const { killId, saveId, victimName } = room.nightActions;

        if (killId && killId !== saveId) {
            const victim = [...io.sockets.sockets.values()].find(s => s.id === killId);
            if (victim) {
                victim.isAlive = false;
                room.aliveCount--;
                io.to(roomId).emit('game_event', { 
                    type: 'attack', victimId: killId, victimName: victimName 
                });
            }
        } else if (killId && killId === saveId) {
            io.to(roomId).emit('sys_msg', '🛡️ Доктор спас игрока! Ночью никто не погиб.');
        }

        room.phase = 'day';
        room.activeRole = null;
        room.nightActions = { killId: null, saveId: null };
        
        if (!checkWinCondition(roomId)) {
            io.to(roomId).emit('change_phase', { phase: 'day' });
            io.to(roomId).emit('sys_msg', '☀️ Город просыпается. Время голосования!');
        }
    }

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            socket.emit('sys_msg', `Голос принят.`);
            
            // Если все живые проголосовали (или хотя бы один для теста)
            if (Object.keys(room.votes).length >= 1) { 
                const targetSocket = [...io.sockets.sockets.values()].find(s => s.id === targetId);
                if (targetSocket) {
                    targetSocket.isAlive = false;
                    room.aliveCount--;
                    io.to(socket.roomId).emit('sys_msg', `⚖️ Жители решили казнить ${targetSocket.userData.name}.`);
                }

                if (!checkWinCondition(socket.roomId)) {
                    room.phase = 'night';
                    room.activeRole = 'mafia';
                    room.votes = {};
                    io.to(socket.roomId).emit('change_phase', { phase: 'night', activeRole: 'mafia' });
                    
                    // Уведомляем мафию
                    const m = [...io.sockets.sockets.values()].find(s => s.roomId === socket.roomId && s.role === 'mafia');
                    if (m) m.emit('sys_msg', '🌙 Снова ваша ночь, Мафия.');
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
        if (socket.roomId && socket.isAlive) {
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
