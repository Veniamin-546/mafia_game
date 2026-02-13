const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Server is Running!');
});

const io = new Server(server, { cors: { origin: "*" } });
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        let roomId = data.code ? data.code.toString() : "1234";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Player";
        socket.isVip = data.isVip || false;

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby', limit: data.limit || 2 };
        }

        rooms[roomId].players.push({ 
            id: socket.id, name: socket.userName, role: null, isVip: socket.isVip 
        });

        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        if (rooms[roomId].players.length >= rooms[roomId].limit && rooms[roomId].phase === 'lobby') {
            rooms[roomId].phase = 'night';
            assignRoles(roomId);
        }
    });

    function assignRoles(roomId) {
        let p = rooms[roomId].players;
        p[0].role = 'mafia'; // Первый зашедший всегда мафия для теста
        if(p[1]) p[1].role = 'citizen';

        p.forEach(player => {
            io.to(player.id).emit('start_game', { 
                role: player.role,
                playersList: p.map(pl => ({name: pl.name, id: pl.id, isVip: pl.isVip})) 
            });
        });
        io.to(roomId).emit('chat_event', { type: 'sys', text: "night_start" });
    }

    socket.on('game_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);

        if (player.role === 'mafia') {
            io.to(socket.roomId).emit('chat_event', { type: 'sys', text: "action_done" });
            
            // ПЕРЕКЛЮЧАЕМ НА ДЕНЬ
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', { 
                phase: 'day', 
                text: "day_start",
                playersList: room.players.map(pl => ({name: pl.name, id: pl.id}))
            });
        }
    });

    socket.on('chat', (data) => {
        if (!socket.roomId) return;
        io.to(socket.roomId).emit('chat_event', { 
            user: (socket.isVip ? "👑 " : "") + socket.userName, 
            text: data.text, isVip: socket.isVip 
        });
    });
});

server.listen(process.env.PORT || 3000);
