/**
 * Remote Piano Server v1.0.6
 * 변경점: 방 목록 실시간 브로드캐스팅 및 비번 보안 로직
 */
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

// 현재 공개 가능한 방 목록(비번 제외) 생성 함수
function getRoomList() {
    return Object.keys(rooms).map(name => ({
        name,
        userCount: rooms[name].users.length
    }));
}

io.on('connection', (socket) => {
    // 접속하자마자 방 목록 전송
    socket.emit('room-list', getRoomList());

    socket.on('join-room', ({ roomName, userName, password }) => {
        // 방이 없으면 생성, 있으면 비번 확인
        if (!rooms[roomName]) {
            rooms[roomName] = { password, users: [] };
        } else {
            if (rooms[roomName].password !== password) {
                return socket.emit('error-msg', '비밀번호가 일치하지 않습니다.');
            }
        }

        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        io.to(roomName).emit('update-users', rooms[roomName].users);
        io.emit('room-list', getRoomList()); // 방 목록 갱신
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
                if (room.users.length === 0) delete rooms[roomName];
                io.emit('room-list', getRoomList());
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 v1.0.6 서버 실행 중`); });
