const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('MAFIA_SERVER_ACTIVE');
});

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let queue = []; // Очередь поиска

io.on('connection', (socket) => {
    console.log('Подключен:', socket.id);

    socket.on('join_queue', (data) => {
        // Проверяем, нет ли его уже в очереди
        if (!queue.find(s => s.id === socket.id)) {
            socket.userData = data;
            queue.push(socket);
            console.log('В очереди:', queue.length);
        }

        // Каждую секунду проверяем очередь и создаем пары
        if (queue.length >= 2) {
            const p1 = queue.shift();
            const p2 = queue.shift();
            const roomId = `room_${p1.id}`;

            p1.join(roomId);
            p2.join(roomId);

            // Назначаем роли
            const roles = Math.random() > 0.5 ? ['мафия', 'мирный'] : ['мирный', 'мафия'];

            io.to(p1.id).emit('start_game', { room: roomId, role: roles[0], opp: p2.userData.name });
            io.to(p2.id).emit('start_game', { room: roomId, role: roles[1], opp: p1.userData.name });
            
            console.log('Игра создана:', roomId);
        } else {
            // Сообщаем игроку, что он один
            socket.emit('queue_status', queue.length);
        }
    });

    socket.on('action', (roomId) => {
        io.to(roomId).emit('to_day');
    });

    socket.on('message', (data) => {
        io.to(data.room).emit('new_msg', { user: data.user, text: data.text });
    });

    socket.on('disconnect', () => {
        queue = queue.filter(s => s.id !== socket.id);
        console.log('Отключен. В очереди:', queue.length);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Сервер на порту:', PORT));
