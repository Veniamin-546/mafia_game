const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.end('MAFIA_MATCHMAKING_READY'); });
const io = new Server(server, { cors: { origin: "*" } });

let playersQueue = []; // Очередь тех, кто нажал "Играть"
let activeRooms = {};

io.on('connection', (socket) => {
    socket.on('find_match', (userData) => {
        socket.user = userData;
        playersQueue.push(socket);

        // Уведомляем всех в очереди о количестве игроков
        io.emit('queue_update', playersQueue.length);

        if (playersQueue.length >= 2) {
            const p1 = playersQueue.shift();
            const p2 = playersQueue.shift();
            const roomId = `room_${Date.now()}`;

            p1.join(roomId); p2.join(roomId);
            p1.roomId = roomId; p2.roomId = roomId;

            activeRooms[roomId] = { players: [p1, p2], phase: 'night' };

            // Распределяем роли
            p1.role = 'mafia';
            p2.role = 'citizen';

            [p1, p2].forEach(s => {
                s.emit('match_found', {
                    role: s.role,
                    oppName: s.role === 'mafia' ? p2.user.name : p1.user.name
                });
            });
        }
    });

    socket.on('night_action', () => {
        if (socket.role === 'mafia' && activeRooms[socket.roomId]) {
            activeRooms[socket.roomId].phase = 'day';
            io.to(socket.roomId).emit('phase_day');
        }
    });

    socket.on('send_chat', (text) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('chat_msg', {
                user: (socket.user.isVip ? socket.user.vipIcon + " " : "") + socket.user.name,
                text: text,
                isVip: socket.user.isVip
            });
        }
    });

    socket.on('disconnect', () => {
        playersQueue = playersQueue.filter(s => s.id !== socket.id);
        io.emit('queue_update', playersQueue.length);
    });
});

server.listen(process.env.PORT || 3000);
