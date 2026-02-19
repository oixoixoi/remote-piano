const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const rooms = {};

io.on('connection', (socket) => {
  // 방 접속/생성 통합 (심플)
  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) rooms[roomName] = { password, users: [] };
    if (rooms[roomName].password !== password) return socket.emit('error-msg', '비밀번호 틀림');

    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    socket.to(roomName).emit('user-joined', user);
  });

  // P2P 신호 교환
  socket.on('webrtc-signal', (d) => io.to(d.to).emit('webrtc-signal', { from: socket.id, signal: d.signal }));
  
  // MIDI 릴레이
  socket.on('midi-msg', (d) => {
    socket.to(d.roomName).emit('remote-midi', { id: socket.id, msg: d.msg });
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      const idx = rooms[room].users.findIndex(u => u.id === socket.id);
      if (idx !== -1) {
        rooms[room].users.splice(idx, 1);
        io.to(room).emit('user-left', socket.id);
        if (rooms[room].users.length === 0) delete rooms[room];
      }
    }
  });
});

http.listen(3000, () => console.log('🚀 v1.4.0 Server Online'));
