/**
 * Remote Piano Server v1.1.9
 * 변경점: 자기 자신에게 신호가 돌아오는 현상 차단 (Loopback 방지)
 */
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

function getRoomList() {
    return Object.keys(rooms).map(name => ({ name, userCount: rooms[name].users.length }));
}

io.on('connection', (socket) => {
    socket.emit('room-list', getRoomList());

    socket.on('join-room', ({ roomName, userName, password }) => {
        if (!rooms[roomName]) rooms[roomName] = { password, users: [] };
        else if (rooms[roomName].password !== password) return socket.emit('error-msg', '비밀번호가 일치하지 않습니다.');

        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        io.to(roomName).emit('update-users', rooms[roomName].users);
        io.emit('room-list', getRoomList());
    });

    // 핵심 수정: 신호를 보낸 소켓(자신)을 제외한 룸의 다른 사람들에게만 전달
    socket.on('midi-msg', (data) => {
        socket.to(data.roomName).emit('remote-midi', { 
            senderId: socket.id, // 누가 보냈는지 명시
            msg: data.msg 
        });
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
server.listen(PORT, () => { console.log(`🚀 v1.1.9 서버 가동 중 (무한루프 방지)`); });
