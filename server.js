const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

// --- НАСТРОЙКИ БОТА ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8577050382:AAHOorg_1VdNppZJYkWSqscIl8d1GVeZkbM'; 
// !!! ЗАМЕНИ ЭТО ЧИСЛО НА СВОЙ TG ID (можно узнать через /start у бота) !!!
const ADMIN_TG_ID = 927590102; 

// --- НОВАЯ ЛОГИКА: ОБРАБОТКА ТЕЛЕГРАМ-СООБЩЕНИЙ ---
let lastUpdateId = 0;
async function handleTelegramUpdates() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                
                // 1. ОТВЕТ НА PRE_CHECKOUT_QUERY (ОБЯЗАТЕЛЬНО ДЛЯ STARS)
                if (update.pre_checkout_query) {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pre_checkout_query_id: update.pre_checkout_query.id,
                            ok: true
                        })
                    });
                }

                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text;
                    const firstName = update.message.from.first_name;
                    const userId = update.message.from.id; // Получаем реальный ID пользователя

                    if (text === '/start') {
                        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `Привет, ${firstName}! 👋\n\nТвой личный ID: ${userId}\nЯ — движок Mafia Supreme. Заходи в Mini App!`,
                                reply_markup: {
                                    inline_keyboard: [[
                                        { text: "Играть в Мафию 🎭", url: "https://t.me/Mafia_Game_Vens_bot/app" }
                                    ]]
                                }
                            })
                        });
                    }
                }
                
                // 2. ОБРАБОТКА УСПЕШНОГО ПЛАТЕЖА
                if (update.message && update.message.successful_payment) {
                    const payload = update.message.successful_payment.invoice_payload;
                    console.log("ПЛАТЕЖ ПОДТВЕРЖДЕН:", payload);
                    
                    const parts = payload.split('_');
                    const type = parts.slice(1, -1).join('_');
                    const socketId = parts[parts.length - 1];

                    applyBonusToSocket(socketId, type);
                }
            }
        }
    } catch (error) {
        console.error("Update error:", error);
    }
    setTimeout(handleTelegramUpdates, 1000);
}

// Функция выдачи бонуса (используется и для платежей, и для админки)
function applyBonusToSocket(targetId, type, isByUserId = false) {
    let targetSocket;
    
    if (isByUserId) {
        // Поиск по уникальному ID игрока
        targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.userData && s.userData.userId == targetId);
    } else {
        // Поиск по Socket ID
        targetSocket = io.sockets.sockets.get(targetId);
    }

    if (targetSocket && targetSocket.userData) {
        if (type.startsWith('vip') || type === 'give_vip') {
            targetSocket.userData.isVip = true;
            targetSocket.userData.vipIcon = "👑";
            targetSocket.emit('sys_msg', '🎉 Статус PREMIUM активирован!');
        } else if (type === 'luck_c') {
            targetSocket.userData.commLuck = 800;
            targetSocket.userData.luckGamesLeft = 3;
            targetSocket.emit('sys_msg', '🍀 Бонус: Шанс Комиссара +80% на 3 игры.');
        } else if (type === 'luck_m') {
            targetSocket.userData.mafiaLuck = 800;
            targetSocket.userData.luckGamesLeft = 3;
            targetSocket.emit('sys_msg', '🍀 Бонус: Шанс Мафии +80% на 3 игры.');
        }
        targetSocket.emit('user_data_updated', targetSocket.userData);
        return true;
    }
    return false;
}

handleTelegramUpdates();

// --- СЕРВЕР ---

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_SUPREME_ENGINE_RUNNING');
});

const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

const NIGHT_ORDER = ['mafia', 'comm', 'doc'];

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- АДМИН ПАНЕЛЬ ---
    socket.on('admin_command', (data) => {
        // Проверка: только ты можешь выполнять это
        if (data.adminKey !== ADMIN_TG_ID) {
            socket.emit('sys_msg', '🚫 Отказано в доступе');
            return;
        }

        const { targetUserId, action } = data;
        const success = applyBonusToSocket(targetUserId, action, true);

        if (success) {
            socket.emit('sys_msg', `✅ Команда ${action} выполнена для игрока ${targetUserId}`);
        } else {
            socket.emit('sys_msg', `❌ Игрок с ID ${targetUserId} не найден в сети`);
        }
    });

    socket.on('update_settings', (data) => {
        if (socket.userData) {
            if (data.name) {
                socket.userData.name = data.name;
            }
            if (socket.userData.isVip && data.vipIcon) {
                socket.userData.vipIcon = data.vipIcon;
            }
            socket.emit('sys_msg', 'Никнейм успешно изменен!');

            if (socket.roomId && rooms[socket.roomId]) {
                const room = rooms[socket.roomId];
                const playersInfo = room.players.map(pid => {
                    const s = io.sockets.sockets.get(pid);
                    if (!s) return null;
                    return { 
                        id: pid, 
                        userId: s.userData.userId, // Передаем ID для админки
                        name: s.userData.name, 
                        isVip: s.userData.isVip, 
                        vipIcon: s.userData.isVip ? s.userData.vipIcon : null, 
                        isHost: s.isHost 
                    };
                }).filter(p => p !== null);
                io.to(socket.roomId).emit('room_update', { players: playersInfo });
            }
        }
    });

    socket.on('create_invoice', async (data) => {
        try {
            const { type, amount } = data; 
            let title = "";
            let description = "";

            if (type.startsWith('vip')) {
                title = "👑 PREMIUM VIP";
                const period = type === 'vip_1y' ? "год" : (type === 'vip_4m' ? "4 месяца" : "1 месяц");
                description = `Золотой статус на ${period}, уникальная иконка и приоритет в чате.`;
            } else if (type === 'luck_c') {
                title = "🔍 ШАНС КОМИССАРА";
                description = "Увеличивает шанс получить роль Комиссара на 80% (на 3 игры).";
            } else if (type === 'luck_m') {
                title = "🔪 ШАНС МАФИИ";
                description = "Увеличивает шанс получить роль Мафии на 80% (на 3 игры).";
            }

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    description: description,
                    payload: `pay_${type}_${socket.id}`, 
                    provider_token: "", 
                    currency: "XTR",    
                    prices: [{ label: "Покупка", amount: parseInt(amount) }] 
                })
            });

            const result = await response.json();
            
            if (result.ok && result.result) {
                socket.emit('invoice_ready', { url: result.result, type: type });
            } else {
                socket.emit('sys_msg', 'Ошибка создания счета. Проверьте настройки BotFather.');
            }
        } catch (error) {
            socket.emit('sys_msg', 'Критическая ошибка сервера платежей.');
        }
    });

    socket.on('create_room', (userData) => {
        const roomId = generateRoomCode();
        socket.userData = userData;
        // Генерируем ID если его нет
        if (!socket.userData.userId) socket.userData.userId = Math.floor(100000 + Math.random() * 900000);
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
            players: [{ 
                id: socket.id, 
                userId: socket.userData.userId,
                name: userData.name, 
                isVip: userData.isVip, 
                vipIcon: userData.isVip ? userData.vipIcon : null, 
                isHost: true 
            }] 
        });
    });

    socket.on('join_room', (data) => {
        const { roomId, userData } = data;
        const room = rooms[roomId];
        
        if (room && room.phase === 'lobby' && room.players.length < 12) {
            socket.userData = userData;
            if (!socket.userData.userId) socket.userData.userId = Math.floor(100000 + Math.random() * 900000);
            socket.roomId = roomId;
            socket.isHost = false;
            room.players.push(socket.id);
            socket.join(roomId);
            
            const playersInfo = room.players.map(pid => {
                const s = io.sockets.sockets.get(pid);
                return { 
                    id: pid, 
                    userId: s.userData.userId,
                    name: s.userData.name, 
                    isVip: s.userData.isVip, 
                    vipIcon: s.userData.isVip ? s.userData.vipIcon : null, 
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

    socket.on('join_queue', (userData) => {
        socket.userData = userData; 
        if (!socket.userData.userId) socket.userData.userId = Math.floor(100000 + Math.random() * 900000);
        if (!queue.find(s => s.id === socket.id)) {
            queue.push(socket);
        }
        
        io.emit('queue_size', queue.length);

        if (queue.length >= 10) {
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

    function startGameForRoom(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const playersSockets = room.players.map(id => io.sockets.sockets.get(id)).filter(s => s);
        
        playersSockets.sort((a, b) => {
            const getWeight = (s) => {
                let weight = 0;
                if (s.userData.luckGamesLeft > 0) {
                    weight += (s.userData.mafiaLuck || 0);
                    weight += (s.userData.commLuck || 0);
                }
                if (s.userData.isVip) weight += 250;
                return weight;
            };
            return getWeight(b) - getWeight(a);
        });
        
        playersSockets.forEach((p, idx) => {
            p.isAlive = true;
            if (idx === 0) p.role = 'mafia';
            else if (idx === 1) p.role = 'comm';
            else if (idx === 2 && playersSockets.length > 3) p.role = 'doc';
            else p.role = 'citizen';

            if (p.userData.luckGamesLeft > 0) {
                p.userData.luckGamesLeft -= 1;
                p.emit('sys_msg', `🍀 Использован бонус! Осталось: ${p.userData.luckGamesLeft}`);
                p.emit('user_data_updated', p.userData);
            }
        });

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
                    userId: pl.userData.userId, // Важно для админки
                    name: pl.userData.name, 
                    isVip: pl.userData.isVip,
                    vipIcon: pl.userData.isVip ? pl.userData.vipIcon : null 
                }))
            });
        });
    }

    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'night' || socket.role !== room.activeRole) return;

        if (socket.role === 'mafia' && data.action === 'kill') {
            room.nightActions.killId = data.targetId;
            room.nightActions.victimName = data.targetName;
        }
        if (socket.role === 'comm' && data.action === 'check') {
            const target = io.sockets.sockets.get(data.targetId);
            const isMafia = target && target.role === 'mafia';
            socket.emit('sys_msg', `🔍 Результат: ${data.targetName} - ${isMafia ? 'МАФИЯ' : 'МИРНЫЙ'}`);
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
                io.to(roomId).emit('game_event', { type: 'attack', victimId: killId, victimName: victimName });
            }
        }

        room.phase = 'day';
        room.activeRole = null;
        room.nightActions = { killId: null, saveId: null };
        if (!checkWinCondition(roomId)) io.to(roomId).emit('change_phase', { phase: 'day' });
    }

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            const alivePlayers = room.players.filter(pid => io.sockets.sockets.get(pid)?.isAlive);

            if (Object.keys(room.votes).length >= alivePlayers.length) { 
                const counts = {};
                Object.values(room.votes).forEach(vid => counts[vid] = (counts[vid] || 0) + 1);
                const sorted = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                const targetSocket = io.sockets.sockets.get(sorted[0]);

                if (targetSocket) {
                    targetSocket.isAlive = false;
                    room.aliveCount--;
                    io.to(socket.roomId).emit('sys_msg', `⚖️ Казнен ${targetSocket.userData.name}.`);
                }

                if (!checkWinCondition(socket.roomId)) {
                    room.phase = 'night';
                    room.activeRole = 'mafia';
                    room.votes = {};
                    io.to(socket.roomId).emit('change_phase', { phase: 'night', activeRole: 'mafia' });
                }
            }
        }
    });

    function checkWinCondition(roomId) {
        const room = rooms[roomId];
        if(!room) return true;
        const players = room.players.map(pid => io.sockets.sockets.get(pid)).filter(s => s);
        const mafiaAlive = players.some(p => p.role === 'mafia' && p.isAlive);
        const citizensAlive = players.some(p => p.role !== 'mafia' && p.isAlive);

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
                vipIcon: socket.userData.isVip ? socket.userData.vipIcon : null
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
