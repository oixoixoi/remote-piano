/**
 * Remote Piano Server v1.1.3
 * 변경점: 클라이언트 깜빡임 방지를 위한 안정화 버전
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
server.listen(PORT, () => { console.log(`🚀 v1.1.3 서버 가동 중`); });
