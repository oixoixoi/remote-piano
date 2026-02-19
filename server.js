const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*" } // 외부 접속 허용
});

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
    socket.to(roomName).emit('user-joined', user);
  });

  socket.on('midi-msg', (data) => {
    socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
    io.to(data.roomName).emit('user-activity', { id: socket.id });
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

// Render에서는 환경변수 PORT를 사용해야 함
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 온! 포트: ${PORT}`);
});
