const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_ENGINE_V2_ONLINE');
});

const io = new Server(server, { cors: { origin: "*" } });
let rooms = new Map();

io.on('connection', (socket) => {
    socket.on('join_match', (userData) => {
        let roomId = "LOBBY_1"; // Упрощенный подбор для теста
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { players: [], phase: 'waiting', votes: new Map() });
        }
        
        let room = rooms.get(roomId);
        let player = {
            id: socket.id,
            name: userData.name || "Anonymous",
            isVip: userData.isVip || false,
            role: null,
            alive: true
        };
        
        room.players.push(player);
        socket.roomId = roomId;

        io.to(roomId).emit('lobby_update', {
            players: room.players.map(p => ({ name: p.name, isVip: p.isVip })),
            count: room.players.length,
            needed: 2
        });

        if (room.players.length >= 2 && room.phase === 'waiting') {
            startMatch(roomId);
        }
    });

    function startMatch(roomId) {
        let room = rooms.get(roomId);
        room.phase = 'night';
        
        // Роли
        room.players[0].role = 'mafia';
        room.players[1].role = 'citizen';

        room.players.forEach(p => {
            io.to(p.id).emit('game_start', {
                role: p.role,
                players: room.players.map(pl => ({ id: pl.id, name: pl.name }))
            });
        });
    }

    socket.on('execute_action', (targetId) => {
        let room = rooms.get(socket.roomId);
        if (room && room.phase === 'night') {
            room.phase = 'day';
            io.to(socket.roomId).emit('new_phase', { 
                phase: 'day', 
                msg: "Солнце взошло. Город ищет убийцу." 
            });
        }
    });

    socket.on('cast_vote', (targetId) => {
        let room = rooms.get(socket.roomId);
        room.votes.set(socket.id, targetId);
        
        if (room.votes.size >= room.players.length) {
            let mafia = room.players.find(p => p.role === 'mafia');
            if (targetId === mafia.id) {
                io.to(socket.roomId).emit('end_game', { winner: 'citizens', text: "МАФИЯ ПОЙМАНА!" });
            } else {
                io.to(socket.roomId).emit('end_game', { winner: 'mafia', text: "МИРНЫЙ КАЗНЕН. МАФИЯ ПОБЕДИЛА!" });
            }
            rooms.delete(socket.roomId);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            let room = rooms.get(socket.roomId);
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) rooms.delete(socket.roomId);
            }
        }
    });
});

server.listen(process.env.PORT || 3000);
