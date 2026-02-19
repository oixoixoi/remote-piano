const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

io.on('connection', (socket) => {
    // 1. 방 접속/생성 통합 로직
    socket.on('join-room', ({ roomName, userName, password }) => {
        // 방이 없으면 새로 생성
        if (!rooms[roomName]) {
            rooms[roomName] = { password, users: [] };
        }
        
        // 비밀번호 체크
        if (rooms[roomName].password !== password) {
            return socket.emit('error-msg', '비밀번호가 일치하지 않습니다.');
        }

        // 방 입장
        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        
        // 본인 및 방 인원에게 알림
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        io.to(roomName).emit('update-users', rooms[roomName].users);
    });

    // 2. 미디 신호 중계
    socket.on('midi-msg', (data) => {
        socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
    });

    // 3. 접속 종료 처리
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
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
