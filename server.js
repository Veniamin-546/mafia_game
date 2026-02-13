const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Noir Server: Multi-Phase & Multi-Lang Active');
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
            rooms[roomId] = { 
                players: [], 
                phase: 'lobby', 
                limit: data.limit || 2,
                actionsThisNight: 0 
            };
        }

        rooms[roomId].players.push({ 
            id: socket.id, 
            name: socket.userName, 
            role: null, 
            alive: true, 
            isVip: socket.isVip 
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

        // Распределение
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
        io.to(roomId).emit('chat_event', { type: 'sys', text: "night_start" }); // Код для перевода
    }

    socket.on('game_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        room.actionsThisNight++;

        // Логика без палева
        if (player.role === 'mafia' && data.action === 'hide') {
            io.to(socket.roomId).emit('chat_event', { type: 'sys', text: "action_stealth" });
        } else if (player.role === 'comisar' && data.action === 'check') {
            const target = room.players.find(p => p.id === data.target);
            socket.emit('chat_event', { type: 'sys', text: `check_res|${target.name}|${target.role === 'mafia' ? 'mafia' : 'citizen'}` });
        }

        // Переход в ДЕНЬ
        let activeRoles = room.players.filter(p => p.role !== 'citizen').length;
        if (room.actionsThisNight >= activeRoles) {
            room.phase = 'day';
            room.actionsThisNight = 0;
            io.to(socket.roomId).emit('phase_change', { phase: 'day', text: "day_start" });
        }
    });

    socket.on('chat', (data) => {
        if (!socket.roomId) return;
        io.to(socket.roomId).emit('chat_event', { 
            user: (socket.isVip ? "👑 " : "") + socket.userName, 
            text: data.text,
            isVip: socket.isVip 
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

server.listen(process.env.PORT || 3000);
