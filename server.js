const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.writeHead(200); res.end('MAFIA_PRO_V1'); });
const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_game', (data) => {
        const roomId = data.code || "1234";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.user = { 
            name: data.name, 
            vipIcon: data.vipIcon, 
            isVip: data.isVip,
            lang: data.lang || 'ru'
        };

        if (!rooms[roomId]) rooms[roomId] = { players: [], phase: 'lobby' };
        rooms[roomId].players.push(socket);

        io.to(roomId).emit('update_lobby', rooms[roomId].players.length);

        if (rooms[roomId].players.length === 2 && rooms[roomId].phase === 'lobby') {
            rooms[roomId].phase = 'night';
            rooms[roomId].players.forEach((s, i) => {
                s.role = (i === 0) ? 'mafia' : 'citizen';
                s.emit('start_game', { 
                    role: s.role, 
                    opponents: rooms[roomId].players.filter(p => p.id !== s.id).map(p => p.user.name)
                });
            });
        }
    });

    socket.on('action', () => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'night') {
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', 'day');
        }
    });

    socket.on('chat', (msg) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('msg', {
                user: (socket.user.isVip ? socket.user.vipIcon + " " : "") + socket.user.name,
                text: msg,
                isVip: socket.user.isVip
            });
        }
    });
});

server.listen(process.env.PORT || 3000);
