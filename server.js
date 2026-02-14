const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.end('MAFIA_PRO_SERVER'); });
const io = new Server(server, { cors: { origin: "*" } });

let queue = [];
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_queue', (data) => {
        socket.userData = data; 
        if (!queue.find(s => s.id === socket.id)) queue.push(socket);

        io.emit('queue_update', queue.length);

        if (queue.length >= 2) { // Стартуем вдвоем для теста
            const p1 = queue.shift();
            const p2 = queue.shift();
            const roomId = `room_${Date.now()}`;

            // Раздача ролей с учетом доната
            let players = [p1, p2];
            players.sort((a, b) => (b.userData.mafiaLuck || 0) - (a.userData.mafiaLuck || 0));
            
            p1.role = 'mafia';
            p2.role = 'citizen'; // Для 3-х можно добавить comm

            rooms[roomId] = { players, phase: 'night' };

            players.forEach(p => {
                p.join(roomId);
                p.roomId = roomId;
                p.emit('start_game', {
                    room: roomId,
                    role: p.role,
                    opponents: players.filter(x => x.id !== p.id).map(x => ({id: x.id, name: x.userData.name}))
                });
            });
        }
    });

    socket.on('use_ability', (data) => {
        const room = rooms[socket.roomId];
        if (room) {
            if (data.type === 'kill') {
                io.to(socket.roomId).emit('sys_msg', `💀 Игрок ${data.targetName} был атакован!`);
            }
            room.phase = 'day';
            io.to(socket.roomId).emit('change_phase', 'day');
        }
    });

    socket.on('vote', (targetId) => {
        io.to(socket.roomId).emit('sys_msg', `⚖️ Голосование принято. Наступает ночь...`);
        io.to(socket.roomId).emit('change_phase', 'night');
    });

    socket.on('message', (d) => {
        io.to(d.room).emit('new_msg', { user: d.user, text: d.text, isVip: d.isVip });
    });

    socket.on('disconnect', () => {
        queue = queue.filter(s => s.id !== socket.id);
        io.emit('queue_update', queue.length);
    });
});

server.listen(process.env.PORT || 3000);
