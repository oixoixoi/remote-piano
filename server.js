const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const rooms = {};

io.on('connection', (socket) => {
  socket.on('create-room', ({ roomName, userName, password }) => {
    if (rooms[roomName]) return socket.emit('error-msg', '이미 존재하는 방 이름입니다.');
    if (!/^\d{4}$/.test(password)) return socket.emit('error-msg', '비밀번호는 숫자 4자리여야 합니다.');
    rooms[roomName] = { password, users: [] };
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
  });

  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) return socket.emit('error-msg', '존재하지 않는 방입니다.');
    if (rooms[roomName].password !== password) return socket.emit('error-msg', '비밀번호가 틀렸습니다.');
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    socket.to(roomName).emit('user-joined', user);
  });

  socket.on('webrtc-signal', (data) => {
    io.to(data.to).emit('webrtc-signal', { from: socket.id, signal: data.signal });
  });

  socket.on('midi-msg', (data) => {
    socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
    io.to(data.roomName).emit('user-activity', { id: socket.id });
  });

  socket.on('ping-req', (t) => { socket.emit('ping-res', t); });

  socket.on('disconnect', () => {
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const idx = room.users.findIndex(u => u.id === socket.id);
      if (idx !== -1) {
        room.users.splice(idx, 1);
        io.to(roomName).emit('user-left', socket.id);
        if (room.users.length === 0) delete rooms[roomName];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 v1.3.5 서버 가동 중`); });
