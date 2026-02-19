const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) rooms[roomName] = { password, users: [] };
    if (rooms[roomName].password !== password) {
      socket.emit('error-msg', '비밀번호가 틀렸습니다.');
      return;
    }
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    // 새로 들어온 사람에게 기존 사람들과 P2P 연결하라고 알림
    socket.to(roomName).emit('user-joined', user);
  });

  // WebRTC P2P 연결을 위한 신호(명함) 교환 중계
  socket.on('webrtc-signal', (data) => {
    io.to(data.to).emit('webrtc-signal', { from: socket.id, signal: data.signal });
  });

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
server.listen(PORT, () => { console.log(`🚀 초저지연 서버 온! 포트: ${PORT}`); });
