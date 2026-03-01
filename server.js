const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

// --- НАСТРОЙКИ БОТА ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8577050382:AAHOorg_1VdNppZJYkWSqscIl8d1GVeZkbM'; 
const ADMIN_TG_ID = 927590102; 
const IS_SHOP_OPEN = false; // ТУТ МОЖНО ВКЛЮЧИТЬ/ВЫКЛЮЧИТЬ МАГАЗИН

// --- КОНСТАНТЫ ТАЙМЕРОВ ---
const NIGHT_DURATION = 30000; // 30 секунд на ночь
const DAY_DURATION = 60000;   // 60 секунд на обсуждение и голос

// --- НОВАЯ ЛОГИКА: ОБРАБОТКА ТЕЛЕГРАМ-СООБЩЕНИЙ ---
let lastUpdateId = 0;
async function handleTelegramUpdates() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                
                if (update.pre_checkout_query) {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pre_checkout_query_id: update.pre_checkout_query.id,
                            ok: IS_SHOP_OPEN, // Если магазин закрыт, платеж не пройдет
                            error_message: "Магазин временно закрыт"
                        })
                    });
                }

                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text;
                    const firstName = update.message.from.first_name;
                    const userId = update.message.from.id;

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
                
                if (update.message && update.message.successful_payment) {
                    const payload = update.message.successful_payment.invoice_payload;
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

// Функция выдачи бонуса (Теперь и с монетками)
function applyBonusToSocket(targetId, type, isByUserId = false, amount = 0) {
    let targetSocket;
    
    if (isByUserId) {
        targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.userData && s.userData.userId == targetId);
    } else {
        targetSocket = io.sockets.sockets.get(targetId);
    }

    if (targetSocket && targetSocket.userData) {
        if (!targetSocket.userData.coins) targetSocket.userData.coins = 0;

        if (type.startsWith('vip') || type === 'give_vip') {
            targetSocket.userData.isVip = true;
            targetSocket.userData.vipIcon = "👑";
            targetSocket.emit('sys_msg', '🎉 Статус PREMIUM активирован администратором!');
        } else if (type === 'luck_c') {
            targetSocket.userData.commLuck = 800;
            targetSocket.userData.luckGamesLeft = 3;
            targetSocket.emit('sys_msg', '🍀 Бонус: Шанс Комиссара +80% на 3 игры.');
        } else if (type === 'luck_m') {
            targetSocket.userData.mafiaLuck = 800;
            targetSocket.userData.luckGamesLeft = 3;
            targetSocket.emit('sys_msg', '🍀 Бонус: Шанс Мафии +80% на 3 игры.');
        } else if (type === 'give_coins') {
            const add = amount || 10;
            targetSocket.userData.coins += add;
            targetSocket.emit('sys_msg', `💰 Получено монет: ${add}`);
        }
        
        targetSocket.emit('user_data_updated', targetSocket.userData);
        console.log(`[ADMIN] Bonus ${type} applied to ${targetId}`);
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

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ТАЙМЕРА ---
function setRoomTimer(roomId, duration, callback) {
    if (rooms[roomId]) {
        if (rooms[roomId].timer) clearTimeout(rooms[roomId].timer);
        rooms[roomId].timer = setTimeout(callback, duration);
        io.to(roomId).emit('timer_sync', { duration: duration / 1000 });
    }
}

io.on('connection', (socket) => {
    // --- АДМИН ПАНЕЛЬ ---
    socket.on('admin_command', (data) => {
        if (Number(data.adminKey) !== Number(ADMIN_TG_ID)) {
            socket.emit('sys_msg', '🚫 Отказано в доступе: ID не совпадает');
            return;
        }

        const { targetUserId, action, amount } = data;
        const finalAction = action || 'give_vip';
        const success = applyBonusToSocket(targetUserId, finalAction, true, amount);

        if (success) {
            socket.emit('sys_msg', `✅ Успешно: ${finalAction} для ${targetUserId}`);
        } else {
            socket.emit('sys_msg', `❌ Игрок ${targetUserId} не найден`);
        }
    });

    socket.on('update_settings', (data) => {
        if (socket.userData) {
            if (data.name) socket.userData.name = data.name;
            if (socket.userData.isVip && data.vipIcon) socket.userData.vipIcon = data.vipIcon;
            socket.emit('sys_msg', 'Настройки обновлены!');
            
            if (socket.roomId && rooms[socket.roomId]) {
                const room = rooms[socket.roomId];
                const playersInfo = room.players.map(pid => {
                    const s = io.sockets.sockets.get(pid);
                    if (!s) return null;
                    return { 
                        id: pid, 
                        userId: s.userData.userId,
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
        if (!IS_SHOP_OPEN) {
            return socket.emit('sys_msg', '🏪 Магазин временно закрыт на технические работы.');
        }

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
                socket.emit('sys_msg', 'Ошибка создания счета.');
            }
        } catch (error) {
            socket.emit('sys_msg', 'Критическая ошибка сервера платежей.');
        }
    });

    socket.on('create_room', (userData) => {
        const roomId = generateRoomCode();
        socket.userData = userData;
        if (!socket.userData.userId) socket.userData.userId = Math.floor(100000 + Math.random() * 900000);
        if (!socket.userData.coins) socket.userData.coins = 0;
        socket.isHost = true;
        rooms[roomId] = { players: [socket.id], phase: 'lobby', isLocal: true, hostId: socket.id, nightActions: { killId: null, saveId: null }, votes: {}, timer: null };
        socket.roomId = roomId;
        socket.join(roomId);
        socket.emit('room_created', { roomId, players: [{ id: socket.id, userId: socket.userData.userId, name: userData.name, isVip: userData.isVip, vipIcon: userData.isVip ? userData.vipIcon : null, isHost: true }] });
    });

    socket.on('join_room', (data) => {
        const { roomId, userData } = data;
        const room = rooms[roomId];
        if (room && room.phase === 'lobby' && room.players.length < 12) {
            socket.userData = userData;
            if (!socket.userData.userId) socket.userData.userId = Math.floor(100000 + Math.random() * 900000);
            if (!socket.userData.coins) socket.userData.coins = 0;
            socket.roomId = roomId;
            socket.isHost = false;
            room.players.push(socket.id);
            socket.join(roomId);
            const playersInfo = room.players.map(pid => {
                const s = io.sockets.sockets.get(pid);
                return { id: pid, userId: s.userData.userId, name: s.userData.name, isVip: s.userData.isVip, vipIcon: s.userData.isVip ? s.userData.vipIcon : null, isHost: s.isHost };
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
        if (!socket.userData.coins) socket.userData.coins = 0;
        if (!queue.find(s => s.id === socket.id)) queue.push(socket);
        io.emit('queue_size', queue.length);
        if (queue.length >= 10) {
            const playersSockets = [];
            for(let i=0; i<10; i++) playersSockets.push(queue.shift());
            const roomId = `online_${Date.now()}`;
            rooms[roomId] = { players: playersSockets.map(p => p.id), phase: 'night', activeRole: 'mafia', nightActions: { killId: null, saveId: null }, votes: {}, aliveCount: 10, timer: null };
            playersSockets.forEach(p => { p.roomId = roomId; p.join(roomId); });
            startGameForRoom(roomId);
            io.emit('queue_size', queue.length);
        }
    });

    function startGameForRoom(roomId) {
        const room = rooms[roomId];
        if (!room) return;
        const playersSockets = room.players.map(id => io.sockets.sockets.get(id)).filter(s => s);
        
        // Сортировка по весу для ролей
        playersSockets.sort((a, b) => {
            const getWeight = (s) => {
                let weight = 0;
                if (s.userData.luckGamesLeft > 0) weight += (s.userData.mafiaLuck || 0) + (s.userData.commLuck || 0);
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
                    userId: pl.userData.userId, 
                    name: pl.userData.name, 
                    isVip: pl.userData.isVip, 
                    vipIcon: pl.userData.isVip ? pl.userData.vipIcon : null 
                })) 
            });
        });

        // Запуск авто-таймера ночи
        setRoomTimer(roomId, NIGHT_DURATION, () => finishNight(roomId));
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
            socket.emit('sys_msg', `🔍 Результат: ${data.targetName} - ${target && target.role === 'mafia' ? 'МАФИЯ' : 'МИРНЫЙ'}`);
        }
        if (socket.role === 'doc' && data.action === 'heal') room.nightActions.saveId = data.targetId;
        
        advanceNightTurn(socket.roomId);
    });

    function advanceNightTurn(roomId) {
        const room = rooms[roomId];
        if(!room) return;
        const currentIndex = NIGHT_ORDER.indexOf(room.activeRole);
        
        if (currentIndex < NIGHT_ORDER.length - 1) {
            room.activeRole = NIGHT_ORDER[currentIndex + 1];
            const nextPlayer = room.players.map(pid => io.sockets.sockets.get(pid)).find(s => s && s.role === room.activeRole && s.isAlive);
            if (nextPlayer) {
                io.to(roomId).emit('change_phase', { phase: 'night', activeRole: room.activeRole });
                // Сбрасываем и обновляем таймер для следующей роли
                setRoomTimer(roomId, NIGHT_DURATION, () => advanceNightTurn(roomId));
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
        } else if (killId && killId === saveId) {
            io.to(roomId).emit('sys_msg', '🚑 Доктор спас жителя этой ночью!');
        }

        room.phase = 'day'; 
        room.activeRole = null; 
        room.nightActions = { killId: null, saveId: null };
        
        if (!checkWinCondition(roomId)) {
            io.to(roomId).emit('change_phase', { phase: 'day' });
            // Авто-завершение голосования дня по таймеру
            setRoomTimer(roomId, DAY_DURATION, () => {
                const r = rooms[roomId];
                if (r && r.phase === 'day') processVotes(roomId);
            });
        }
    }

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            const alivePlayers = room.players.filter(pid => io.sockets.sockets.get(pid)?.isAlive);
            if (Object.keys(room.votes).length >= alivePlayers.length) { 
                processVotes(socket.roomId);
            }
        }
    });

    function processVotes(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const counts = {};
        Object.values(room.votes).forEach(vid => counts[vid] = (counts[vid] || 0) + 1);
        
        const sorted = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
        
        if (sorted.length > 0) {
            const targetSocket = io.sockets.sockets.get(sorted[0]);
            if (targetSocket) { 
                targetSocket.isAlive = false; 
                room.aliveCount--; 
                io.to(roomId).emit('sys_msg', `⚖️ По результатам голосования казнен ${targetSocket.userData.name}.`); 
            }
        } else {
            io.to(roomId).emit('sys_msg', '⚖️ Жители не смогли договориться. Никто не казнен.');
        }

        if (!checkWinCondition(roomId)) { 
            room.phase = 'night'; 
            room.activeRole = 'mafia'; 
            room.votes = {}; 
            io.to(roomId).emit('change_phase', { phase: 'night', activeRole: 'mafia' }); 
            setRoomTimer(roomId, NIGHT_DURATION, () => finishNight(roomId));
        }
    }

    function checkWinCondition(roomId) {
        const room = rooms[roomId];
        if(!room) return true;
        const players = room.players.map(pid => io.sockets.sockets.get(pid)).filter(s => s);
        const mafiaAlive = players.filter(p => p.role === 'mafia' && p.isAlive).length;
        const citizensAlive = players.filter(p => p.role !== 'mafia' && p.isAlive).length;
        
        let winner = null;
        if (mafiaAlive === 0) winner = 'citizens';
        else if (mafiaAlive >= citizensAlive) winner = 'mafia';

        if (winner) {
            if (room.timer) clearTimeout(room.timer);
            players.forEach(p => {
                if (!p.userData.coins) p.userData.coins = 0;
                if (winner === 'citizens' && p.role !== 'mafia') {
                    p.userData.coins += 2; 
                } else if (winner === 'mafia' && p.role === 'mafia') {
                    p.userData.coins += 5; 
                }
                p.emit('user_data_updated', p.userData);
            });
            io.to(roomId).emit('game_over', { winner: winner });
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
        console.log(`User disconnected: ${socket.id}`);
        queue = queue.filter(s => s.id !== socket.id);
        
        if (socket.roomId && rooms[socket.roomId]) {
            const room = rooms[socket.roomId];
            // Если игрок был жив, уменьшаем счетчик и проверяем победу
            if (socket.isAlive) {
                socket.isAlive = false;
                room.aliveCount--;
                io.to(socket.roomId).emit('sys_msg', `🏃 Игрок ${socket.userData?.name || 'Неизвестный'} покинул город...`);
                checkWinCondition(socket.roomId);
            }
        }
        io.emit('queue_size', queue.length);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
