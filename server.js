const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.writeHead(200); res.end('MAFIA_CORE_V4'); });
const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};
let quickQueue = []; // Для быстрой игры

io.on('connection', (socket) => {
    // ЛОГИКА ВХОДА
    socket.on('join_room', (data) => {
        const { name, isVip, mode, code } = data;
        socket.userData = { name, isVip, id: socket.id };
        
        let roomId = mode === 'quick' ? "QUICK_LOBBY" : (code || "1234");
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby', limit: 2 };
        }

        rooms[roomId].players.push(socket);

        // Обновляем список для всех в лобби
        io.to(roomId).emit('lobby_update', {
            count: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // Старт игры если набралось 2 человека
        if (rooms[roomId].players.length >= 2 && rooms[roomId].phase === 'lobby') {
            startGame(roomId);
        }
    });

    function startGame(roomId) {
        let room = rooms[roomId];
        room.phase = 'night';
        let p = room.players;
        
        // Мафия всегда второй игрок для теста, или рандом
        let mafiaIdx = Math.floor(Math.random() * p.length);
        
        p.forEach((s, i) => {
            s.role = (i === mafiaIdx) ? 'mafia' : 'citizen';
            s.emit('game_start', { 
                role: s.role, 
                players: p.map(pl => ({id: pl.id, name: pl.userData.name})) 
            });
        });
    }

    socket.on('game_action', (targetId) => {
        const room = rooms[socket.roomId];
        if (room && room.phase === 'night' && socket.role === 'mafia') {
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', 'day');
        }
    });

    socket.on('chat', (msg) => {
        if(socket.roomId) {
            io.to(socket.roomId).emit('chat_msg', {
                user: (socket.userData.isVip ? "👑 " : "") + socket.userData.name,
                text: msg,
                isVip: socket.userData.isVip
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
