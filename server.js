const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => { res.end('SERVER_RUNNING'); });
const io = new Server(server, { cors: { origin: "*" } });

let matchmakingQueue = []; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('find_match', (userData) => {
        // Проверяем, нет ли уже игрока в очереди
        if (matchmakingQueue.find(s => s.id === socket.id)) return;
        
        socket.user = userData;
        matchmakingQueue.push(socket);
        
        console.log('Queue:', matchmakingQueue.length);
        io.emit('queue_update', matchmakingQueue.length);

        if (matchmakingQueue.length >= 2) {
            const p1 = matchmakingQueue.shift();
            const p2 = matchmakingQueue.shift();
            const roomId = `room_${p1.id}`;

            p1.join(roomId);
            p2.join(roomId);
            p1.roomId = roomId;
            p2.roomId = roomId;

            p1.role = 'mafia';
            p2.role = 'citizen';

            io.to(roomId).emit('match_found', {
                room: roomId,
                players: [
                    {id: p1.id, name: p1.user.name, role: p1.role},
                    {id: p2.id, name: p2.user.name, role: p2.role}
                ]
            });
            console.log('Match started in room:', roomId);
        }
    });

    socket.on('night_action', (roomId) => {
        io.to(roomId).emit('phase_day');
    });

    socket.on('send_chat', (data) => {
        io.to(data.roomId).emit('chat_msg', {
            user: data.name,
            text: data.text,
            isVip: data.isVip
        });
    });

    socket.on('disconnect', () => {
        matchmakingQueue = matchmakingQueue.filter(s => s.id !== socket.id);
        io.emit('queue_update', matchmakingQueue.length);
    });
});

server.listen(process.env.PORT || 3000);
