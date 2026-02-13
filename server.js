const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Noir Server: VIP & Stealth Edition');
});

const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

io.on('connection', (socket) => {
    console.log('Подключен:', socket.id);

    socket.on('join_room', (data) => {
        let roomId = data.code ? data.code.toString() : "TEST_ROOM";
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Игрок";
        socket.isVip = data.isVip || false; // Получаем статус VIP при входе

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], phase: 'lobby', limit: data.limit || 2 };
        }

        // Добавляем игрока со всеми его атрибутами
        rooms[roomId].players.push({ 
            id: socket.id, 
            name: socket.userName, 
            role: null, 
            alive: true, 
            isVip: socket.isVip,
            canSelfHeal: true 
        });

        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // СТАРТ ИГРЫ
        if (rooms[roomId].players.length >= rooms[roomId].limit && rooms[roomId].phase === 'lobby') {
            startMatch(roomId);
        }
    });

    function startMatch(roomId) {
        rooms[roomId].phase = 'night';
        let p = rooms[roomId].players;
        
        // Сортировка с учетом шансов (простая реализация)
        // Игроки с VIP или купленными шансами перемещаются в начало очереди на роли
        let shuffled = [...p].sort(() => 0.5 - Math.random());

        // Распределение ролей
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
        
        io.to(roomId).emit('chat_event', { type: 'sys', text: "🌑 Город засыпает. Наступила ночь." });
    }

    socket.on('game_action', (data) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        
        // ЛОГИКА СКРЫТНОСТИ МАФИИ
        if (player.role === 'mafia' && data.action === 'hide') {
            io.to(socket.roomId).emit('chat_event', { 
                type: 'sys', 
                text: "🌙 В подворотнях что-то промелькнуло, но ночь осталась спокойной..." 
            });
            return;
        }

        // Логика комиссара (не палим цель в общий чат)
        if (player.role === 'comisar' && data.action === 'check') {
            const target = room.players.find(p => p.id === data.target);
            socket.emit('chat_event', { 
                type: 'sys', 
                text: `🔍 Результат проверки: ${target.name} — ${target.role === 'mafia' ? 'МАФИЯ' : 'МИРНЫЙ'}` 
            });
            io.to(socket.roomId).emit('chat_event', { type: 'sys', text: "🕵️‍♂️ Комиссар закончил осмотр улиц." });
            return;
        }

        // Общее уведомление о действии (без имен)
        let actionMsg = "🎭 Кто-то совершил свой выбор в темноте...";
        io.to(socket.roomId).emit('chat_event', { type: 'sys', text: actionMsg });
    });

    socket.on('chat', (data) => {
        if (!socket.roomId) return;
        
        // Если игрок VIP, добавляем корону
        let namePrefix = socket.isVip ? "👑 " : "";
        
        io.to(socket.roomId).emit('chat_event', { 
            user: namePrefix + socket.userName, 
            text: data.text,
            isVip: socket.isVip 
        });
    });

    socket.on('disconnect', () => {
        // Удаление из комнат при выходе
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
