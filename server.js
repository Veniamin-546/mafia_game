const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Engine: Round Cycles Active');
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
            rooms[roomId] = { players: [], phase: 'lobby', limit: 2, votes: {} };
        }

        rooms[roomId].players.push({ 
            id: socket.id, 
            name: data.name, 
            role: null, 
            isVip: data.isVip, 
            alive: true 
        });

        io.to(roomId).emit('update_lobby', {
            count: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            id: roomId
        });

        if (rooms[roomId].players.length >= rooms[roomId].limit && rooms[roomId].phase === 'lobby') {
            startNewRound(roomId, true);
        }
    });

    function startNewRound(roomId, isFirstTime = false) {
        let room = rooms[roomId];
        room.phase = 'night';
        room.votes = {};
        
        if (isFirstTime) {
            // Распределение ролей при самом первом старте
            let p = room.players;
            p[0].role = 'mafia';
            p[1].role = 'citizen';
            if(p[2]) p[2].role = 'citizen'; 
        }

        let alivePlayers = room.players.filter(x => x.alive);
        
        alivePlayers.forEach(pl => {
            io.to(pl.id).emit('start_phase', { 
                phase: 'night',
                role: pl.role, 
                players: alivePlayers.map(x => ({id: x.id, name: x.name})) 
            });
        });
        io.to(roomId).emit('chat_msg', { type: 'sys', text: "night_start" });
    }

    // ДЕЙСТВИЕ МАФИИ (УБИЙСТВО)
    socket.on('action', (targetId) => {
        let room = rooms[socket.roomId];
        if(!room || room.phase !== 'night') return;

        // Переходим в день
        room.phase = 'day';
        let alivePlayers = room.players.filter(x => x.alive);

        io.to(socket.roomId).emit('start_phase', { 
            phase: 'day',
            players: alivePlayers.map(x => ({id: x.id, name: x.name}))
        });
        io.to(socket.roomId).emit('chat_msg', { type: 'sys', text: "day_start" });
    });

    // ГОЛОСОВАНИЕ ДНЕМ
    socket.on('vote', (targetId) => {
        let room = rooms[socket.roomId];
        if(!room || room.phase !== 'day') return;

        room.votes[socket.id] = targetId;
        let aliveCount = room.players.filter(x => x.alive).length;

        // Когда все проголосовали
        if(Object.keys(room.votes).length >= aliveCount) {
            // Проверяем, кого выгнали (упрощенно: последний голос решает в тесте на 2-х)
            let kickedPlayer = room.players.find(p => p.id === targetId);
            
            if(kickedPlayer.role === 'mafia') {
                io.to(socket.roomId).emit('game_over', { winner: 'citizens', text: "Мафия поймана! Мирные победили!" });
                delete rooms[socket.roomId]; // Конец игры
            } else {
                io.to(socket.roomId).emit('chat_msg', { type: 'sys', text: `Жители выгнали ${kickedPlayer.name}, но он был мирным...` });
                startNewRound(socket.roomId); // Новый круг
            }
        }
    });

    socket.on('chat', (msg) => {
        io.to(socket.roomId).emit('chat_msg', { 
            user: (socket.isVip ? "👑 " : "") + socket.userName, 
            text: msg, 
            vip: socket.isVip 
        });
    });
});

server.listen(process.env.PORT || 3000);
