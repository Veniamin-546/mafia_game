const io = require('socket.io')(process.env.PORT || 3000, {
    cors: {
        origin: "*", // Разрешаем подключения со всех адресов
        methods: ["GET", "POST"]
    }
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('join_room', (data) => {
        // Если кода нет, создаем случайный, если режим online - общая комната
        let roomId = data.code || Math.floor(1000 + Math.random() * 9000).toString();
        if(data.mode === 'online') roomId = "GLOBAL_ROOM";

        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Аноним";

        // Инициализируем комнату, если её нет
        if(!rooms[roomId]) {
            rooms[roomId] = { 
                players: [], 
                limit: parseInt(data.limit) || 10 
            };
        }

        // Добавляем игрока, если лимит не превышен
        if (rooms[roomId].players.length < rooms[roomId].limit) {
            rooms[roomId].players.push({ id: socket.id, name: socket.userName });
        }

        console.log(`Игрок ${socket.userName} вошел в комнату ${roomId}`);

        // Рассылаем всем в комнате обновленный статус
        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // Если комната набралась — начинаем игру
        if(rooms[roomId].players.length >= rooms[roomId].limit) {
            io.to(roomId).emit('start_game', { role: "Мирный житель" });
        }
    });

    // Обработка чата
    socket.on('chat', (data) => {
        if(socket.roomId) {
            io.to(socket.roomId).emit('chat_event', { 
                user: socket.userName, 
                text: data.text 
            });
        }
    });

    // Обработка действий (заданий)
    socket.on('action', (data) => {
        if(socket.roomId) {
            io.to(socket.roomId).emit('chat_event', { 
                type: 'sys', 
                text: `${socket.userName} ${data.text}` 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        // Здесь можно добавить логику удаления игрока из массива rooms
    });
});

console.log("Сервер Mafia запущен!");
