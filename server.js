const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Noir Server: Running');
});

const io = new Server(server, { cors: { origin: "*" } });
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        let roomId = data.code || "1234";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name;
        socket.isVip = data.isVip;

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby', limit: 2 };
        }

        rooms[roomId].players.push({ id: socket.id, name: data.name, role: null, isVip: data.isVip });

        io.to(roomId).emit('update_lobby', {
            count: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            id: roomId
        });

        if (rooms[roomId].players.length >= rooms[roomId].limit && rooms[roomId].phase === 'lobby') {
            startMatch(roomId);
        }
    });

    function startMatch(roomId) {
        let room = rooms[roomId];
        room.phase = 'night';
        let p = room.players;
        
        // Распределяем роли для теста (1-й всегда мафия)
        p[0].role = 'mafia';
        p[1].role = 'citizen';

        p.forEach(pl => {
            io.to(pl.id).emit('start_game', { 
                role: pl.role, 
                players: p.map(x => ({id: x.id, name: x.name})) 
            });
        });
        io.to(roomId).emit('sys_msg', { type: 'night' });
    }

    socket.on('action', () => {
        let room = rooms[socket.roomId];
        if(room && room.phase === 'night') {
            room.phase = 'day';
            io.to(socket.roomId).emit('phase_change', { phase: 'day' });
        }
    });

    socket.on('chat', (msg) => {
        io.to(socket.roomId).emit('chat_msg', { 
            user: (socket.isVip ? "👑 " : "") + socket.userName, 
            text: msg, 
            vip: socket.isVip 
        });
    });

    socket.on('disconnect', () => {
        if(socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
        }
    });
});

server.listen(process.env.PORT || 3000);
