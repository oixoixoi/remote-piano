const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const rooms = {};

// 전체 유저에게 현재 방 목록을 쏴주는 함수
function broadcastRoomList() {
  io.emit('room-list', Object.keys(rooms));
}

io.on('connection', (socket) => {
  // 처음 사이트에 들어오면 현재 열린 방 목록부터 보여줌
  socket.emit('room-list', Object.keys(rooms));

  // 1. 방 만들기
  socket.on('create-room', ({ roomName, userName, password }) => {
    if (rooms[roomName]) {
      socket.emit('error-msg', '이미 존재하는 방 이름입니다.'); return;
    }
    if (!/^\d{4}$/.test(password)) {
      socket.emit('error-msg', '비밀번호는 숫자 4자리여야 합니다.'); return;
    }
    
    rooms[roomName] = { password, users: [] };
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    broadcastRoomList(); // 방이 생겼으니 전체 새로고침
  });

  // 2. 방 접속
  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) {
      socket.emit('error-msg', '존재하지 않는 방입니다.'); return;
    }
    if (rooms[roomName].password !== password) {
      socket.emit('error-msg', '비밀번호가 틀렸습니다.'); return;
    }

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
        // 방에 아무도 안 남으면 방 폭파
        if (room.users.length === 0) {
          delete rooms[roomName];
          broadcastRoomList(); // 방이 없어졌으니 전체 새로고침
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 로비 시스템 서버 온! 포트: ${PORT}`); });
