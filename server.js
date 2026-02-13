const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_PREMIUM_ENGINE_V1');
});

const io = new Server(server, { cors: { origin: "*" } });
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_game', (data) => {
        const { name, isVip, code } = data;
        const roomId = code || "1234";
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.details = { name: name || "Player", isVip: isVip || false };

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby' };
        }

        // Предотвращаем дублирование
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push(socket);
        }

        io.to(roomId).emit('lobby_update', {
            count: rooms[roomId].players.length,
            players: rooms[roomId].players.map(p => ({ name: p.details.name, isVip: p.details.isVip }))
        });

        // Автостарт на двоих
        if (rooms[roomId].players.length === 2 && rooms[roomId].phase === 'lobby') {
            startGame(roomId);
        }
    });

    function startGame(roomId) {
        const room = rooms[roomId];
        room.phase = 'night';
        const p = room.players;
        
        // Мафия — всегда первый зашедший для теста, либо рандом
        const mafiaIdx = 0; 
        p.forEach((s, i) => {
            s.role = (i === mafiaIdx) ? 'mafia' : 'citizen';
            s.emit('game_init', { 
                role: s.role,
                opponents: p.filter(x => x.id !== s.id).map(x => ({id: x.id, name: x.details.name}))
            });
        });
        io.to(roomId).emit('sys_msg', '🌙 Ночь наступила. Мафия выбирает жертву.');
    }

    socket.on('execute_night_action', () => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'night' && socket.role === 'mafia') {
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', { phase: 'day', msg: '☀️ Солнце взошло. Город проснулся.' });
        }
    });

    socket.on('send_chat', (text) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('new_msg', {
                user: (socket.details.isVip ? "👑 " : "") + socket.details.name,
                text: text,
                isVip: socket.details.isVip
            });
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(s => s.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

server.listen(process.env.PORT || 3000);
