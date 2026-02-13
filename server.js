const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Server: Phase Logic Fixed');
});

const io = new Server(server, { cors: { origin: "*" } });
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        let roomId = data.code ? data.code.toString() : "GLOBAL";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Игрок";
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
            startMatch(roomId);
        }
    });

    function startMatch(roomId) {
        let room = rooms[roomId];
        room.phase = 'night';
        let p = room.players;
        let shuffled = [...p].sort(() => 0.5 - Math.random());

        shuffled[0].role = 'mafia';
        if (shuffled.length > 1) shuffled[1].role = 'doctor';
        if (shuffled.length > 2) shuffled[2].role = 'comisar';
        for(let i = 3; i < shuffled.length; i++) shuffled[i].role = 'citizen';

        shuffled.forEach(player => {
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

        // Мафия — триггер смены фазы
        if (player.role === 'mafia') {
            io.to(socket.roomId).emit('chat_event', { type: 'sys', text: data.action === 'hide' ? "action_stealth" : "action_done" });
            
            // Наступает ДЕНЬ сразу после хода мафии (для динамики)
            setTimeout(() => {
                room.phase = 'day';
                io.to(socket.roomId).emit('phase_change', { 
                    phase: 'day', 
                    text: "day_start",
                    playersList: room.players.map(pl => ({name: pl.name, id: pl.id}))
                });
            }, 1000);
        }

        if (player.role === 'comisar' && data.action === 'check') {
            const target = room.players.find(p => p.id === data.target);
            socket.emit('chat_event', { type: 'sys', text: `check_res|${target.name}|${target.role === 'mafia' ? 'mafia' : 'citizen'}` });
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
