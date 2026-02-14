const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch'); // npm install node-fetch@2

const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ОТ_BOTFATHER';

// Цены в Stars
const PRICES = {
    vip_1m: 150,
    vip_4m: 500,
    vip_1y: 1200,
    luck_comm: 200,
    luck_mafia: 250
};

const server = http.createServer((req, res) => { res.writeHead(200); res.end('SERVER_RUNNING'); });
const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    // --- ПЛАТЕЖИ ---
    socket.on('create_invoice', async (data) => {
        const { itemId } = data;
        const price = PRICES[itemId];
        if (!price) return;

        let title = itemId.includes('vip') ? "👑 PREMIUM VIP" : "🔍 ШАНС КОМИССАРА";
        
        try {
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    description: `Активация: ${itemId}`,
                    payload: `pay_${itemId}_${socket.id}`,
                    currency: "XTR",
                    prices: [{ label: "Stars", amount: price }]
                })
            });
            const result = await response.json();
            if (result.ok) socket.emit('invoice_ready', { url: result.result, itemId });
        } catch (e) { console.error(e); }
    });

    // --- ПОДБОР И РОЛИ ---
    socket.on('join_queue', (userData) => {
        socket.userData = userData;
        if (!queue.find(s => s.id === socket.id)) queue.push(socket);
        io.emit('queue_size', queue.length);

        if (queue.length >= 2) { // Для теста 2, для игры лучше 3+
            const players = [queue.shift(), queue.shift()];
            const roomId = `room_${Date.now()}`;
            
            // Распределение (кто купил шанс мафии/комми, тот получает роль)
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            
            rooms[roomId] = { players, phase: 'night', actionsDone: 0 };

            players.forEach((p, i) => {
                p.join(roomId);
                p.roomId = roomId;
                p.isAlive = true;
                p.role = (i === 0) ? 'mafia' : 'comm'; // Упрощенно для 2 игроков

                p.emit('start_game', {
                    room: roomId, role: p.role, myId: p.id,
                    players: players.map(pl => ({ id: pl.id, name: pl.userData.name, isVip: pl.userData.isVip, vipIcon: pl.userData.vipIcon }))
                });
            });
        }
    });

    // --- ИГРОВЫЕ ДЕЙСТВИЯ ---
    socket.on('night_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        if (socket.role === 'mafia' && data.action === 'kill') {
            const victim = room.players.find(p => p.id === data.targetId);
            if (victim) {
                victim.isAlive = false;
                io.to(socket.roomId).emit('game_event', { type: 'attack', victimId: victim.id, victimName: victim.userData.name });
            }
        }
        
        if (socket.role === 'comm' && data.action === 'check') {
            const target = room.players.find(p => p.id === data.targetId);
            socket.emit('sys_msg', `Результат: ${data.targetName} - ${target.role === 'mafia' ? 'МАФИЯ' : 'МИРНЫЙ'}`);
        }

        // Завершение ночи
        room.phase = 'day';
        io.to(socket.roomId).emit('change_phase', 'day');
        checkWin(room);
    });

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        
        const victim = room.players.find(p => p.id === targetId);
        if (victim) {
            victim.isAlive = false;
            io.to(socket.roomId).emit('sys_msg', `Город проголосовал против ${victim.userData.name}`);
            room.phase = 'night';
            io.to(socket.roomId).emit('change_phase', 'night');
            checkWin(room);
        }
    });

    socket.on('send_msg', (msg) => {
        if (socket.roomId) io.to(socket.roomId).emit('new_msg', { user: socket.userData.name, text: msg, isVip: socket.userData.isVip, vipIcon: socket.userData.vipIcon });
    });
});

function checkWin(room) {
    const mafia = room.players.filter(p => p.role === 'mafia' && p.isAlive);
    const citizens = room.players.filter(p => p.role !== 'mafia' && p.isAlive);

    if (mafia.length === 0) {
        io.to(room.id).emit('game_over', { winner: 'citizens' });
    } else if (mafia.length >= citizens.length) {
        io.to(room.id).emit('game_over', { winner: 'mafia' });
    }
}

server.listen(process.env.PORT || 3000);
