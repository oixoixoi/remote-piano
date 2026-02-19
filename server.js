const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

io.on('connection', (socket) => {
    // 접속 및 방 생성 통합
    socket.on('join-room', ({ roomName, userName, password }) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { password, users: [] };
        }
        
        if (rooms[roomName].password !== password) {
            return socket.emit('error-msg', '비밀번호가 틀렸습니다.');
        }

        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        
        // 본인에게 성공 알림 및 방 인원 전체 명단 동기화
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        io.to(roomName).emit('update-users', rooms[roomName].users);
    });

    // 미디 신호 중계
    socket.on('midi-msg', (data) => {
        socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
    });

    socket.on('ping-req', (t) => { socket.emit('ping-res', t); });

    socket.on('disconnect', () => {
        for (const roomName in rooms) {
            const room = rooms[roomName];
            const idx = room.users.findIndex(u => u.id === socket.id);
            if (idx !== -1) {
                room.users.splice(idx, 1);
                io.to(roomName).emit('update-users', room.users);
                if (room.users.length === 0) delete rooms[roomName];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 서버 가동 중: ${PORT}`); });
