const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

io.on('connection', (socket) => {
    // 접속 시 현재 방 목록 전송
    socket.emit('room-list', Object.keys(rooms));

    socket.on('join-room', ({ roomName, userName, password }) => {
        // 1. 방이 없으면 새로 생성
        if (!rooms[roomName]) {
            if (password.length < 4) return socket.emit('error-msg', '비밀번호는 4자리 이상이어야 합니다.');
            rooms[roomName] = { password, users: [] };
        } 
        
        // 2. 비밀번호 확인
        if (rooms[roomName].password !== password) {
            return socket.emit('error-msg', '비밀번호가 틀렸습니다.');
        }

        // 3. 방 입장 처리
        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        
        // 4. 성공 알림 및 유저 목록 동기화
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        io.to(roomName).emit('update-users', rooms[roomName].users);
        io.emit('room-list', Object.keys(rooms));
    });

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
                if (room.users.length === 0) {
                    delete rooms[roomName];
                    io.emit('room-list', Object.keys(rooms));
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 서버 가동 중 - 포트 ${PORT}`); });
