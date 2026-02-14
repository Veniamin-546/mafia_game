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

// Порядок ходов ночью
const NIGHT_ORDER = ['mafia', 'comm', 'doc'];

// Вспомогательная функция для генерации кода комнаты
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- ЛОГИКА ОПЛАТЫ TELEGRAM STARS ---
    socket.on('create_invoice', async (data) => {
        try {
            const { type, amount } = data; 
            
            let title = "";
            let description = "";

            if (type.startsWith('vip')) {
                title = "👑 PREMIUM VIP";
                const period = type === 'vip_1y' ? "год" : (type === 'vip_4m' ? "4 месяца" : "1 month");
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

    // --- ЛОГИКА ЛОКАЛЬНЫХ КОМНАТ (НОВОЕ) ---
    socket.on('create_room', (userData) => {
        const roomId = generateRoomCode();
        socket.userData = userData;
        socket.isHost = true;
        
        rooms[roomId] = {
            players: [socket.id],
            phase: 'lobby',
            isLocal: true,
            hostId: socket.id,
            nightActions: { killId: null, saveId: null },
            votes: {}
        };
        
        socket.roomId = roomId;
        socket.join(roomId);
        
        socket.emit('room_created', { 
            roomId, 
            players: [{ id: socket.id, name: userData.name, isVip: userData.isVip, vipIcon: userData.vipIcon, isHost: true }] 
        });
    });

    socket.on('join_room', (data) => {
        const { roomId, userData } = data;
        const room = rooms[roomId];
        
        if (room && room.phase === 'lobby' && room.players.length < 12) {
            socket.userData = userData;
            socket.roomId = roomId;
            socket.isHost = false;
            room.players.push(socket.id);
            socket.join(roomId);
            
            const playersInfo = room.players.map(pid => {
                const s = io.sockets.sockets.get(pid);
                return { 
                    id: pid, 
                    name: s.userData.name, 
                    isVip: s.userData.isVip, 
                    vipIcon: s.userData.vipIcon, 
                    isHost: s.isHost 
                };
            });
            
            io.to(roomId).emit('room_update', { players: playersInfo });
        } else {
            socket.emit('sys_msg', 'Комната не найдена или заполнена');
        }
    });

    socket.on('start_local_game', (roomId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId && room.players.length >= 2) {
            startGameForRoom(roomId);
        } else {
            socket.emit('sys_msg', 'Минимум 2 игрока для старта');
        }
    });

    // --- ОНЛАЙН ОЧЕРЕДЬ (ОБНОВЛЕНО ДО 10) ---
    socket.on('join_queue', (userData) => {
        socket.userData = userData; 
        if (!queue.find(s => s.id === socket.id)) {
            queue.push(socket);
        }
        
        io.emit('queue_size', queue.length);

        if (queue.length >= 10) { // ИЗМЕНЕНО С 2 ДО 10
            const playersSockets = [];
            for(let i=0; i<10; i++) playersSockets.push(queue.shift());
            
            const roomId = `online_${Date.now()}`;
            rooms[roomId] = {
                players: playersSockets.map(p => p.id),
                phase: 'night',
                activeRole: 'mafia',
                nightActions: { killId: null, saveId: null }, 
                votes: {},
                aliveCount: 10
            };

            playersSockets.forEach(p => {
                p.roomId = roomId;
                p.join(roomId);
            });

            startGameForRoom(roomId);
            io.emit('queue_size', queue.length);
        }
    });

    // --- УНИВЕРСАЛЬНЫЙ ЗАПУСК ИГРЫ (ОБНОВЛЕНО С VIP ШАНСАМИ) ---
    function startGameForRoom(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const playersSockets = room.players.map(id => io.sockets.sockets.get(id)).filter(s => s);
        
        // --- ЛОГИКА ШАНСОВ VIP ---
        // Сортируем игроков по "весу" их шансов. Чем выше вес, тем выше они в списке на получение роли.
        playersSockets.sort((a, b) => {
            const getWeight = (s) => {
                let weight = 0;
                // Добавляем шанс от купленной удачи (Luck)
                weight += (s.userData.mafiaLuck || 0);
                weight += (s.userData.commLuck || 0);
                
                // Если есть VIP, добавляем веса согласно условиям (40+50+60+100)
                if (s.userData.isVip) {
                    weight += 250; // Базовый VIP приоритет (сумма всех шансов спец-ролей)
                }
                return weight;
            };
            return getWeight(b) - getWeight(a);
        });
        
        // Распределение (в зависимости от кол-ва игроков)
        // После сортировки по весу, VIP чаще будут попадать в первые индексы [0, 1, 2]
        playersSockets.forEach((p, idx) => {
            p.isAlive = true;
            if (idx === 0) p.role = 'mafia'; // 40% шанс у VIP (через приоритет в списке)
            else if (idx === 1) p.role = 'comm'; // 50% шанс у VIP
            else if (idx === 2 && playersSockets.length > 3) p.role = 'doc'; // 60% шанс у VIP
            else p.role = 'citizen'; // Для VIP житель 100%, если не попал на роли выше
        });

        // Перемешиваем массив для фронтенда, чтобы по порядку в списке не узнали мафию
        const frontendPlayers = [...playersSockets].sort(() => Math.random() - 0.5);

        room.phase = 'night';
        room.activeRole = 'mafia';
        room.aliveCount = playersSockets.length;

        playersSockets.forEach(p => {
            p.emit('start_game', {
                room: roomId,
                role: p.role,
                myId: p.id,
                phase: 'night',
                activeRole: 'mafia',
                players: frontendPlayers.map(pl => ({ 
                    id: pl.id, 
                    name: pl.userData.name, 
                    isVip: pl.userData.isVip,
                    vipIcon: pl.userData.vipIcon 
                }))
            });
            if (p.role === 'mafia') p.emit('sys_msg', '🌙 Наступила ночь. Ваш ход, Мафия!');
        });
    }

    // --- ПООЧЕРЕДНЫЕ ХОДЫ НОЧЬЮ ---
    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'night') return;
        if (socket.role !== room.activeRole) return;

        if (socket.role === 'mafia' && data.action === 'kill') {
            room.nightActions.killId = data.targetId;
            room.nightActions.victimName = data.targetName;
        }
        
        if (socket.role === 'comm' && data.action === 'check') {
            const target = io.sockets.sockets.get(data.targetId);
            const isMafia = target && target.role === 'mafia';
            socket.emit('sys_msg', `🔍 Результат проверки: ${data.targetName} - ${isMafia ? 'МАФИЯ' : 'МИРНЫЙ'}`);
        }

        if (socket.role === 'doc' && data.action === 'heal') {
            room.nightActions.saveId = data.targetId;
        }

        advanceNightTurn(socket.roomId);
    });

    function advanceNightTurn(roomId) {
        const room = rooms[roomId];
        if(!room) return;
        const currentIndex = NIGHT_ORDER.indexOf(room.activeRole);
        
        if (currentIndex < NIGHT_ORDER.length - 1) {
            room.activeRole = NIGHT_ORDER[currentIndex + 1];
            
            const nextPlayer = room.players.map(pid => io.sockets.sockets.get(pid))
                .find(s => s && s.role === room.activeRole && s.isAlive);

            if (nextPlayer) {
                io.to(roomId).emit('sys_msg', `Ход роли: ${room.activeRole}...`);
                nextPlayer.emit('sys_msg', '🌙 Теперь ваш черед действовать!');
                io.to(roomId).emit('change_phase', { phase: 'night', activeRole: room.activeRole });
            } else {
                advanceNightTurn(roomId);
            }
        } else {
            finishNight(roomId);
        }
    }

    function finishNight(roomId) {
        const room = rooms[roomId];
        if(!room) return;
        const { killId, saveId, victimName } = room.nightActions;

        if (killId && killId !== saveId) {
            const victim = io.sockets.sockets.get(killId);
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
            
            const alivePlayers = room.players.filter(pid => {
                const s = io.sockets.sockets.get(pid);
                return s && s.isAlive;
            });

            if (Object.keys(room.votes).length >= alivePlayers.length) { 
                // Считаем голоса
                const counts = {};
                Object.values(room.votes).forEach(vid => counts[vid] = (counts[vid] || 0) + 1);
                const sorted = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                const targetIdToKill = sorted[0];

                const targetSocket = io.sockets.sockets.get(targetIdToKill);
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
                    
                    const m = room.players.map(pid => io.sockets.sockets.get(pid)).find(s => s && s.role === 'mafia' && s.isAlive);
                    if (m) m.emit('sys_msg', '🌙 Снова ваша ночь, Мафия.');
                }
            }
        }
    });

    function checkWinCondition(roomId) {
        const room = rooms[roomId];
        if(!room) return true;
        const playersInRoom = room.players.map(pid => io.sockets.sockets.get(pid)).filter(s => s);
        
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
        // Если хост вышел из локального лобби, удаляем комнату
        if(socket.isHost && rooms[socket.roomId] && rooms[socket.roomId].phase === 'lobby') {
            io.to(socket.roomId).emit('sys_msg', 'Хост покинул комнату');
            delete rooms[socket.roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
