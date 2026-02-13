const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Game Server: Active');
});

const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        let roomId = data.code ? data.code.toString() : "GLOBAL";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Игрок";

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby', limit: parseInt(data.limit) || 4 };
        }

        rooms[roomId].players.push({ id: socket.id, name: socket.userName, role: null, alive: true, canSelfHeal: true });

        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // СТАРТ ИГРЫ
        if (rooms[roomId].players.length >= rooms[roomId].limit && rooms[roomId].phase === 'lobby') {
            rooms[roomId].phase = 'night';
            assignRoles(roomId);
        }
    });

    // Раздача ролей
    function assignRoles(roomId) {
        let p = rooms[roomId].players;
        let shuffled = p.sort(() => 0.5 - Math.random());
        
        shuffled[0].role = 'mafia';
        shuffled[1].role = 'doctor';
        shuffled[2].role = 'comisar';
        for(let i=3; i<shuffled.length; i++) shuffled[i].role = 'citizen';

        shuffled.forEach(player => {
            io.to(player.id).emit('start_game', { 
                role: player.role,
                playersList: p.map(pl => ({name: pl.name, id: pl.id})) 
            });
        });
        
        io.to(roomId).emit('chat_event', { type: 'sys', text: "Наступила ночь... Город засыпает." });
    }

    // Обработка игровых действий
    socket.on('game_action', (data) => {
        const room = rooms[socket.roomId];
        const player = room.players.find(p => p.id === socket.id);
        
        let logText = "";
        if (player.role === 'mafia') {
            logText = data.action === 'kill' ? `Мафия выбрала цель.` : `Мафия скрылась в тенях.`;
        } else if (player.role === 'doctor') {
            if (data.target === socket.id) player.canSelfHeal = false;
            logText = `Доктор выехал на вызов.`;
        } else if (player.role === 'comisar') {
            const target = room.players.find(p => p.id === data.target);
            socket.emit('chat_event', { type: 'sys', text: `Результат проверки: ${target.name} — ${target.role}` });
            logText = `Комиссар проверил одного из жителей.`;
        }

        io.to(socket.roomId).emit('chat_event', { type: 'sys', text: logText });
    });

    socket.on('chat', (data) => {
        io.to(socket.roomId).emit('chat_event', { user: socket.userName, text: data.text });
    });
});

server.listen(process.env.PORT || 3000);
