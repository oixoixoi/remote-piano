const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const rooms = {};

io.on('connection', (socket) => {
  
  // 1. 방 만들기 (새로 개설할 때)
  socket.on('create-room', ({ roomName, userName, password }) => {
    if (rooms[roomName]) {
      socket.emit('error-msg', '이미 존재하는 방 이름입니다. 다른 이름을 사용해주세요.');
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      socket.emit('error-msg', '비밀번호는 숫자 4자리여야 합니다.');
      return;
    }
    
    rooms[roomName] = { password, users: [] };
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
  });

  // 2. 방 접속 (기존 방에 들어갈 때)
  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) {
      socket.emit('error-msg', '존재하지 않는 방입니다. 방 이름을 확인해주세요.');
      return;
    }
    if (rooms[roomName].password !== password) {
      socket.emit('error-msg', '비밀번호가 틀렸습니다.');
      return;
    }

    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    socket.to(roomName).emit('user-joined', user); // 기존 사람들에게 알림
  });

  // [P2P 직통망] 신호 교환
  socket.on('webrtc-signal', (data) => {
    io.to(data.to).emit('webrtc-signal', { from: socket.id, signal: data.signal });
  });

  // [우회망] 서버 릴레이 전송
  socket.on('midi-msg', (data) => {
    socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
    io.to(data.roomName).emit('user-activity', { id: socket.id });
  });

  // 레이턴시 핑퐁
  socket.on('ping-req', (t) => {
    socket.emit('ping-res', t);
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
server.listen(PORT, () => { console.log(`🚀 방 분리형 하이브리드 서버 온! 포트: ${PORT}`); });
