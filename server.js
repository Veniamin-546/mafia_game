const http = require('http');
const { Server } = require('socket.io');

// 1. Создаем базовый HTTP сервер, чтобы Render видел "живой" сайт
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mafia Server is Live and Running!'); // Теперь вместо 404 будет эта надпись
});

// 2. Настраиваем Socket.io поверх этого сервера
const io = new Server(server, {
    cors: {
        origin: "*", // Позволяет подключаться с любого сайта (твоего Mini App)
        methods: ["GET", "POST"]
    }
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('Новый игрок подключился:', socket.id);

    socket.on('join_room', (data) => {
        // Создаем ID комнаты: либо из ввода игрока, либо случайный, либо глобальный
        let roomId = data.code ? data.code.toString() : null;
        
        if (data.mode === 'online') {
            roomId = "GLOBAL_POOL";
        } else if (!roomId) {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = data.name || "Аноним";

        // Инициализируем данные комнаты, если их нет
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                limit: parseInt(data.limit) || 10
            };
        }

        // Добавляем игрока в список
        rooms[roomId].players.push({ id: socket.id, name: socket.userName });

        console.log(`Игрок ${socket.userName} вошел в ${roomId}. Всего: ${rooms[roomId].players.length}`);

        // Отправляем всем в этой комнате обновленное количество игроков
        io.to(roomId).emit('update_lobby', {
            playersCount: rooms[roomId].players.length,
            limit: rooms[roomId].limit,
            roomId: roomId
        });

        // Если комната заполнилась — начинаем игру
        if (rooms[roomId].players.length >= rooms[roomId].limit) {
            io.to(roomId).emit('start_game', { 
                role: "Мирный житель",
                msg: "Город засыпает... Игра началась!" 
            });
        }
    });

    // Обработка сообщений чата
    socket.on('chat', (data) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('chat_event', {
                user: socket.userName,
                text: data.text
            });
        }
    });

    // Обработка игровых действий
    socket.on('action', (data) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('chat_event', {
                type: 'sys',
                text: `${socket.userName} ${data.text}`
            });
        }
    });

    // Очистка при отключении
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            
            // Уведомляем остальных, что игрока меньше
            io.to(socket.roomId).emit('update_lobby', {
                playersCount: rooms[socket.roomId].players.length,
                limit: rooms[socket.roomId].limit,
                roomId: socket.roomId
            });

            // Удаляем комнату, если она пуста
            if (rooms[socket.roomId].players.length === 0) {
                delete rooms[socket.roomId];
            }
        }
        console.log('Игрок ушел:', socket.id);
    });
});

// 3. Запускаем сервер на порту, который выдает Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
