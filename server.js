const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_SUPREME_ENGINE_RUNNING');
});

const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    socket.on('join_queue', (userData) => {
        socket.userData = userData; 
        if (!queue.find(s => s.id === socket.id)) {
            queue.push(socket);
        }
        
        io.emit('queue_size', queue.length);

        // Начинаем игру, когда набралось 2 или более (для теста 2, для фулл логики 3+)
        if (queue.length >= 2) {
            const players = [queue.shift(), queue.shift()];
            const roomId = `room_${Date.now()}`;
            
            // Распределение ролей с учетом покупных шансов
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            const mafia = players[0];
            const others = players.filter(p => p.id !== mafia.id);
            
            // Если игроков больше, можно выделить комиссара
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
                io.to(socket.roomId).emit('game_event', { type: 'attack', victimId: data.targetId, victimName: data.targetName });
            } else {
                socket.emit('sys_msg', 'Вы скрылись в тенях. Вас невозможно проверить этой ночью.');
            }
        }

        if (socket.role === 'comm') {
            if (data.action === 'check') {
                const target = io.sockets.sockets.get(data.targetId);
                socket.emit('sys_msg', `Результат проверки ${data.targetName}: ${target.role === 'mafia' ? 'МАФИЯ 🚩' : 'МИРНЫЙ ✅'}`);
            }
        }

        // Авто-переход в день после действия мафии (упрощенно)
        if (socket.role === 'mafia') {
            room.phase = 'day';
            io.to(socket.roomId).emit('change_phase', 'day');
        }
    });

    socket.on('submit_vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            io.to(socket.roomId).emit('sys_msg', `Голос принят.`);
            
            if (Object.keys(room.votes).length >= 1) { // Для теста - 1 голос решает
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
