const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Test Server: 2 Players Mode Active');
});

const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        let roomId = data.code ? data.code.toString() : "TEST_ROOM";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Игрок";

        if (!rooms[roomId]) {
            // УСТАНОВИЛИ ЛИМИТ 2 ДЛЯ ТЕСТА
            rooms[roomId] = { players: [], phase: 'lobby', limit: 2 }; 
        }

        rooms[roomId].players.push({ 
            id: socket.id, 
            name: socket.userName, 
            role: null, 
            alive: true, 
            canSelfHeal: true 
        });

        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // СТАРТ ИГРЫ ПРИ 2 ИГРОКАХ
        if (rooms[roomId].players.length >= 2 && rooms[roomId].phase === 'lobby') {
            rooms[roomId].phase = 'night';
            
            // Распределяем роли для теста (1 Мафия, 1 Доктор/Комиссар)
            let p = rooms[roomId].players;
            p[0].role = 'mafia';
            p[1].role = Math.random() > 0.5 ? 'doctor' : 'comisar';

            p.forEach(player => {
                io.to(player.id).emit('start_game', { 
                    role: player.role,
                    playersList: p.map(pl => ({name: pl.name, id: pl.id})) 
                });
            });
            
            io.to(roomId).emit('chat_event', { type: 'sys', text: "ТЕСТОВЫЙ ЗАПУСК (2 ИГРОКА). Ночь наступила." });
        }
    });

    socket.on('game_action', (data) => {
        const room = rooms[socket.roomId];
        const player = room.players.find(p => p.id === socket.id);
        let logText = `[${player.role}] ${player.name}: действие ${data.action} на ${data.targetName}`;
        
        io.to(socket.roomId).emit('chat_event', { type: 'sys', text: logText });
    });

    socket.on('chat', (data) => {
        io.to(socket.roomId).emit('chat_event', { user: socket.userName, text: data.text });
    });
});

server.listen(process.env.PORT || 3000);
