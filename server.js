const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.writeHead(200); res.end('MAFIA_SERVER_V3'); });
const io = new Server(server, { cors: { origin: "*" } });

let waitingQueue = []; // Очередь поиска
let rooms = {};

io.on('connection', (socket) => {
    socket.on('find_match', (data) => {
        socket.userData = { name: data.name, isVip: data.isVip, id: socket.id };
        waitingQueue.push(socket);

        if (waitingQueue.length >= 2) {
            const p1 = waitingQueue.shift();
            const p2 = waitingQueue.shift();
            const roomId = `room_${Date.now()}`;

            p1.join(roomId); p2.join(roomId);
            rooms[roomId] = { players: [p1, p2], phase: 'night', votes: {} };

            // Случайные роли
            const roles = Math.random() > 0.5 ? ['mafia', 'citizen'] : ['citizen', 'mafia'];
            
            [p1, p2].forEach((s, i) => {
                s.roomId = roomId;
                s.role = roles[i];
                s.emit('game_start', { 
                    role: s.role, 
                    opponent: (i === 0 ? p2.userData.name : p1.userData.name) 
                });
            });
            io.to(roomId).emit('sys_msg', '🌙 Ночь. Мафия выбирает цель.');
        } else {
            socket.emit('sys_msg', '🔎 Поиск оппонента...');
        }
    });

    socket.on('action', () => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'night' && socket.role === 'mafia') {
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', 'day');
            io.to(socket.roomId).emit('sys_msg', '☀️ Утро! Обсудите и проголосуйте.');
        }
    });

    socket.on('vote', (targetName) => {
        const room = rooms[socket.roomId];
        if (!room || room.phase !== 'day') return;
        room.votes[socket.id] = targetName;

        if (Object.keys(room.votes).length >= 2) {
            io.to(socket.roomId).emit('game_over', 'Раунд завершен! Проверьте чат.');
            delete rooms[socket.roomId];
        }
    });

    socket.on('chat', (text) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('chat_msg', { 
                user: (socket.userData.isVip ? "👑 " : "") + socket.userData.name, 
                text: text, 
                isVip: socket.userData.isVip 
            });
        }
    });

    socket.on('disconnect', () => {
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    });
});

server.listen(process.env.PORT || 3000);
