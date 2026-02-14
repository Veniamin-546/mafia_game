const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.end('MAFIA_ADVANCED_V5'); });
const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_queue', (data) => {
        socket.userData = data; // {name, isVip, mafiaLuck: 0, commLuck: 0}
        queue.push(socket);

        if (queue.length >= 3) { // Игра на троих для теста комиссара
            const players = [queue.shift(), queue.shift(), queue.shift()];
            const roomId = `room_${Date.now()}`;
            
            // Логика шансов: сортируем по купленным шансам
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            const mafia = players[0];
            
            players.sort((a, b) => (b.userData.commLuck || 0) - (a.userData.commLuck || 0));
            // Если мафия уже выбрана, берем следующего для комиссара
            const comm = players.find(p => p.id !== mafia.id) || players[1];
            
            rooms[roomId] = { players, phase: 'night', votes: {}, aliveCount: 3 };

            players.forEach(p => {
                p.join(roomId);
                p.roomId = roomId;
                p.role = (p.id === mafia.id) ? 'mafia' : (p.id === comm.id ? 'comm' : 'citizen');
                p.isAlive = true;
                
                p.emit('start_game', {
                    room: roomId,
                    role: p.role,
                    players: players.map(pl => ({id: pl.id, name: pl.userData.name}))
                });
            });
        }
    });

    // Способности мафии и комиссара
    socket.on('use_ability', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'night') return;

        if (socket.role === 'mafia') {
            if (data.type === 'kill') {
                io.to(socket.roomId).emit('sys_msg', `🔪 Мафия совершила нападение!`);
            } else {
                io.to(socket.roomId).emit('sys_msg', `🌫 Мафия решила скрыться в тенях...`);
            }
        } 
        
        if (socket.role === 'comm') {
            if (data.type === 'check') {
                socket.emit('sys_msg', `🔍 Результат проверки: игрок ${data.targetName} — ${data.targetRole}`);
            } else {
                io.to(socket.roomId).emit('sys_msg', `🔫 Комиссар применил оружие!`);
            }
        }

        // Переход в день
        room.phase = 'day';
        io.to(socket.roomId).emit('change_phase', 'day');
    });

    socket.on('vote', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'day') {
            room.votes[socket.id] = targetId;
            if (Object.keys(room.votes).length >= 2) { // Минимальный порог голосов
                io.to(socket.roomId).emit('sys_msg', `⚖️ Голосование завершено!`);
                room.phase = 'night';
                room.votes = {};
                io.to(socket.roomId).emit('change_phase', 'night');
            }
        }
    });

    socket.on('message', (d) => {
        io.to(d.room).emit('new_msg', { user: d.user, text: d.text });
    });
});

server.listen(process.env.PORT || 3000);
