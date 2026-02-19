const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// CORS 설정: 클라우드타입 환경에서 외부 접속을 안정적으로 허용
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => { 
    res.sendFile(__dirname + '/index.html'); 
});

const rooms = {};

// 전체 유저에게 현재 열려있는 방 목록을 전달하는 함수
function broadcastRoomList() {
    io.emit('room-list', Object.keys(rooms));
}

io.on('connection', (socket) => {
    console.log(`📡 유저 접속: ${socket.id}`);

    // 처음 접속 시 현재 방 목록 전송
    socket.emit('room-list', Object.keys(rooms));

    // 1. 방 만들기
    socket.on('create-room', ({ roomName, userName, password }) => {
        if (rooms[roomName]) {
            socket.emit('error-msg', '이미 존재하는 방 이름입니다.');
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
        
        // 본인에게 성공 알림
        socket.emit('join-success', { roomName, users: rooms[roomName].users });
        
        // 로비 목록 새로고침
        broadcastRoomList();
    });

    // 2. 방 접속
    socket.on('join-room', ({ roomName, userName, password }) => {
        if (!rooms[roomName]) {
            socket.emit('error-msg', '존재하지 않는 방입니다.');
            return;
        }
        if (rooms[roomName].password !== password) {
            socket.emit('error-msg', '비밀번호가 틀렸습니다.');
            return;
        }

        socket.join(roomName);
        const user = { id: socket.id, name: userName };
        rooms[roomName].users.push(user);
        
        // 접속한 본인에게 방 정보 전송
        socket.emit('join-success', { roomName, users: rooms[roomName].users });

        // 중요: 방에 있는 기존 사람들에게 "새 유저가 왔다"고 알림
        socket.to(roomName).emit('user-joined', user);

        // 핵심: 방 안의 모든 사람에게 "최신 유저 명단"을 강제로 동기화
        io.to(roomName).emit('update-users', rooms[roomName].users);
    });

    // WebRTC 시그널링 (P2P 연결용)
    socket.on('webrtc-signal', (data) => {
        if (data.to) {
            io.to(data.to).emit('webrtc-signal', { from: socket.id, signal: data.signal });
        }
    });

    // 미디 신호 전송
    socket.on('midi-msg', (data) => {
        // 보낸 사람을 제외한 방 안의 다른 사람들에게만 신호 전달
        socket.to(data.roomName).emit('remote-midi', { id: socket.id, msg: data.msg });
        // 이름 옆 점(Dot) 깜빡임용 액티비티
        io.to(data.roomName).emit('user-activity', { id: socket.id });
    });

    // 네트워크 핑 체크
    socket.on('ping-req', (t) => { 
        socket.emit('ping-res', t); 
    });

    // 접속 종료 시 처리
    socket.on('disconnect', () => {
        console.log(`❌ 유저 퇴장: ${socket.id}`);
        for (const roomName in rooms) {
            const room = rooms[roomName];
            const idx = room.users.findIndex(u => u.id === socket.id);
            
            if (idx !== -1) {
                const leftUserName = room.users[idx].name;
                room.users.splice(idx, 1);
                
                // 유저가 나갔음을 알리고 명단 새로고침 명령
                io.to(roomName).emit('user-left', socket.id);
                io.to(roomName).emit('update-users', room.users);

                // 방에 아무도 없으면 방 삭제
                if (room.users.length === 0) {
                    delete rooms[roomName];
                    broadcastRoomList();
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`🚀 서버 가동 중 | 포트: ${PORT}`); 
});
