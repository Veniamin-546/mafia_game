const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // Нужно установить: npm install axios

const BOT_TOKEN = '8577050382:AAHOorg_1VdNppZJYkWSqscIl8d1GVeZkbM'; // Вставь сюда токен от BotFather
const server = http.createServer((req, res) => { res.end('MAFIA_V6_ENGINE'); });
const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    // --- ОПЛАТА STARS ---
    socket.on('create_stars_invoice', async (data) => {
        try {
            const title = data.type === 'vip' ? "VIP Статус" : "Шанс Мафии";
            const description = "Поддержите игру и получите бонусы!";
            const payload = `${data.type}_${socket.id}`;
            const currency = "XTR"; // Код для Telegram Stars

            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: title,
                description: description,
                payload: payload,
                provider_token: "", // Пусто для Stars
                currency: currency,
                prices: [{ label: "Цена", amount: data.amount }]
            });

            if (response.data.ok) {
                socket.emit('invoice_link', response.data.result);
            }
        } catch (e) { console.error('Payment error', e); }
    });

    // --- ПОДБОР ---
    socket.on('join_queue', (userData) => {
        socket.userData = userData;
        if (!queue.find(s => s.id === socket.id)) queue.push(socket);
        io.emit('queue_size', queue.length);

        if (queue.length >= 3) { // Для игры нужны минимум 3 (Мафия, Доктор, Комиссар)
            const players = [queue.shift(), queue.shift(), queue.shift()];
            const roomId = `room_${Date.now()}`;
            
            rooms[roomId] = { 
                id: roomId, 
                players: players, 
                phase: 'night', 
                actions: {}, 
                aliveCount: 3 
            };

            // Роли
            const roles = ['mafia', 'doctor', 'comm'];
            roles.sort(() => Math.random() - 0.5);

            players.forEach((p, i) => {
                p.join(roomId);
                p.roomId = roomId;
                p.role = roles[i];
                p.isAlive = true;
                p.emit('start_game', {
                    room: roomId,
                    role: p.role,
                    players: players.map(pl => ({ id: pl.id, name: pl.userData.name }))
                });
            });
        }
    });

    // --- ЛОГИКА ИГРЫ (ЧАТ И ХОДЫ) ---
    socket.on('send_msg', (text) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('new_msg', { 
                user: socket.userData.name, 
                text: text, 
                isVip: socket.userData.isVip 
            });
        }
    });

    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        room.actions[socket.role] = { targetId: data.targetId, type: data.type };

        // Если все походили (Мафия, Доктор, Комиссар)
        if (Object.keys(room.actions).length === room.aliveCount) {
            processNight(room);
        }
    });
});

function processNight(room) {
    const actions = room.actions;
    let killedId = actions.mafia ? actions.mafia.targetId : null;
    let savedId = actions.doctor ? actions.doctor.targetId : null;

    if (killedId === savedId) killedId = null; // Доктор спас!

    io.to(room.id).emit('change_phase', { 
        phase: 'day', 
        killed: killedId,
        commResult: actions.comm ? {
            targetId: actions.comm.targetId,
            isMafia: room.players.find(p => p.id === actions.comm.targetId).role === 'mafia'
        } : null
    });
    room.actions = {};
    room.phase = 'day';
}

server.listen(process.env.PORT || 3000);
