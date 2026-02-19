const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const rooms = {};

io.on('connection', (socket) => {
  socket.on('create-room', ({ roomName, userName, password }) => {
    if (rooms[roomName]) return socket.emit('error-msg', '이미 존재하는 방입니다.');
    rooms[roomName] = { password, users: [] };
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
  });

  socket.on('join-room', ({ roomName, userName, password }) => {
    if (!rooms[roomName]) return socket.emit('error-msg', '존재하지 않는 방입니다.');
    if (rooms[roomName].password !== password) return socket.emit('error-msg', '비밀번호 오류');
    socket.join(roomName);
    const user = { id: socket.id, name: userName };
    rooms[roomName].users.push(user);
    socket.emit('join-success', { roomName, users: rooms[roomName].users });
    socket.to(roomName).emit('user-joined', user);
  });

  socket.on('webrtc-signal', (d) => io.to(d.to).emit('webrtc-signal', { from: socket.id, signal: d.signal }));
  
  socket.on('midi-msg', (d) => {
    socket.to(d.roomName).emit('remote-midi', { id: socket.id, msg: d.msg });
    io.to(d.roomName).emit('user-activity', { id: socket.id });
  });

  socket.on('ping-req', (t) => socket.emit('ping-res', t));

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

http.listen(3000, () => console.log('🚀 v1.3.7 Pedal Sync Server'));
