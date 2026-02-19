<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Remote Piano Session</title>
  <style>
    body { background:#111; color:#fff; display:flex; flex-direction:column; height:100vh; margin:0; overflow:hidden; font-family:sans-serif; touch-action:none; }
    header { padding:15px 25px; display:flex; justify-content:space-between; align-items:center; background:#1a1a1a; border-bottom:1px solid #333; z-index:10; }
    .logo { font-size:22px; font-weight:bold; color:#0f8; }
    .control-group { display:flex; gap:10px; align-items:center; }
    input { padding:10px 15px; background:#222; border:1px solid #444; color:#fff; border-radius:5px; width:120px; outline:none; }
    button { padding:10px 20px; border:none; border-radius:5px; font-weight:bold; cursor:pointer; background:#0f8; color:#000; }
    .btn-leave { background:#ff4444; color:#fff; }
    .status-wrap { background:rgba(0,0,0,0.5); padding:8px 15px; border-radius:10px; border:1px solid #333; text-align:right; }
    #net-mode { font-size:12px; font-weight:bold; color:#888; }
    #net-ping { font-size:14px; font-weight:bold; color:#888; font-family:monospace; }
    #users { padding:20px; display:flex; gap:20px; flex-wrap:wrap; justify-content:center; min-height:40px; }
    .u-card { background:#2a2a2a; padding:10px 20px; border-radius:30px; display:flex; align-items:center; gap:10px; border:1px solid #555; font-weight:bold; }
    .u-dot { width:12px; height:12px; background:#555; border-radius:50%; transition:0.1s; }
    .u-dot.act { background:#0f8; box-shadow:0 0 10px #0f8; transform:scale(1.3); }
    #piano { flex:1; display:flex; align-items:flex-start; padding-top:60px; justify-content:center; overflow-x:auto; background:#050505; }
    .k { position:relative; border-radius:0 0 5px 5px; cursor:pointer; transition:transform 0.05s; }
    .w { width:38px; height:240px; background:#fff; border:1px solid #ccc; z-index:1; margin-right:-1px; }
    .w.on { background:#ffe600; box-shadow:0 0 15px rgba(255,230,0,0.5); transform:translateY(2px); }
    .b { width:24px; height:150px; background:#000; margin:0 -12px 90px -12px; z-index:2; border:1px solid #222; }
    .b.on { background:#ffe600 !important; transform:translateY(2px); }
  </style>
</head>
<body>

<header>
  <div class="logo">🎹 Remote Session</div>
  <div class="control-group" id="login-form">
    <input id="rn" placeholder="방 이름">
    <input id="pw" type="password" placeholder="비번(4자리)">
    <input id="nm" placeholder="닉네임">
    <button onclick="join()">접속</button>
  </div>
  <div class="control-group" id="connected-ui" style="display:none;">
    <div class="status-wrap">
      <div id="net-mode">대기중</div>
      <div id="net-ping">-- ms</div>
    </div>
    <button class="btn-leave" onclick="location.reload()">나가기</button>
  </div>
</header>

<div id="users"></div>
<div id="piano"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
  const audio = new (window.AudioContext||window.webkitAudioContext)();
  const socket = io();
  const oscs = {}, gains = {};
  let midiOutputs = [];
  const echoBlock = {};
  const peers = {};

  let isDragging = false;
  document.addEventListener('mousedown', () => isDragging = true);
  document.addEventListener('mouseup', () => isDragging = false);

  function play(n, v) {
    if(oscs[n]) stop(n);
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'triangle';
    o.frequency.value = 440 * Math.pow(2, (n-69)/12);
    const vol = (v/127) * 0.4;
    g.gain.setValueAtTime(0, audio.currentTime);
    g.gain.linearRampToValueAtTime(vol, audio.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(vol * 0.1, audio.currentTime + 1.5);
    o.connect(g); g.connect(audio.destination);
    o.start();
    oscs[n]=o; gains[n]=g;
    document.getElementById('k'+n)?.classList.add('on');
  }

  function stop(n) {
    if(gains[n]) {
      gains[n].gain.cancelScheduledValues(audio.currentTime);
      gains[n].gain.linearRampToValueAtTime(0, audio.currentTime + 0.05);
    }
    const o = oscs[n];
    setTimeout(() => { if(o) { o.stop(); o.disconnect(); } }, 60);
    delete oscs[n]; delete gains[n];
    document.getElementById('k'+n)?.classList.remove('on');
  }

  function tx(s, n, v) {
    if(audio.state === 'suspended') audio.resume();
    if(s === 144 && v > 0) play(n, v); else stop(n);
    let sentP2P = false;
    const msg = JSON.stringify([s, n, v]);
    for (const id in peers) {
      if (peers[id].dataChannel?.readyState === 'open') {
        peers[id].dataChannel.send(msg);
        sentP2P = true;
      }
    }
    if (!sentP2P && window.currentRoom) socket.emit('midi-msg', { roomName: window.currentRoom, msg: [s, n, v] });
  }

  const pianoEl = document.getElementById('piano');
  for(let i=21; i<=108; i++) {
    const isB = [1,3,6,8,10].includes(i%12);
    const d = document.createElement('div');
    d.id = 'k'+i; d.className = `k ${isB?'b':'w'}`;
    d.addEventListener('mousedown', (e) => { e.preventDefault(); tx(144, i, 100); });
    d.addEventListener('mouseenter', () => { if(isDragging) tx(144, i, 100); });
    d.addEventListener('mouseleave', () => tx(128, i, 0));
    d.addEventListener('mouseup', () => tx(128, i, 0));
    pianoEl.appendChild(d);
  }

  function join() {
    const r = document.getElementById('rn').value, pw = document.getElementById('pw').value, n = document.getElementById('nm').value;
    if(!r || !pw || !n) return alert("빈칸을 채워주세요!");
    if(audio.state === 'suspended') audio.resume();
    socket.emit('join-room', { roomName: r, userName: n, password: pw });
    window.currentRoom = r;
  }

  socket.on('join-success', d => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('connected-ui').style.display = 'flex';
    upd(d.users);
  });

  socket.on('error-msg', m => alert(m));

  socket.on('update-users', us => upd(us));

  socket.on('remote-midi', d => {
    const [s, n, v] = d.msg;
    echoBlock[`${s}-${n}`] = Date.now();
    if(s === 144 && v > 0) play(n, v); else stop(n);
    flash(d.id);
    midiOutputs.forEach(o => { try { o.send([s, n, v]); } catch(e) {} });
  });

  socket.on('ping-res', t => {
    const ms = Date.now() - t;
    document.getElementById('net-ping').innerText = ms + " ms";
    document.getElementById('net-mode').innerText = ms < 60 ? "통신상태: 좋음 🟢" : "통신상태: 보통 🟡";
  });

  setInterval(() => { if(window.currentRoom) socket.emit('ping-req', Date.now()); }, 2000);

  function upd(us) {
    const c = document.getElementById('users'); c.innerHTML = '';
    us.forEach(u => {
      const d = document.createElement('div'); d.className = 'u-card'; d.id='u-'+u.id;
      d.innerHTML=`<span class="u-dot" id="d-${u.id}"></span>${u.name}`;
      c.appendChild(d);
    });
  }

  function flash(id) {
    const d = document.getElementById('d-'+id);
    if(d) { d.classList.add('act'); setTimeout(()=>d.classList.remove('act'), 100); }
  }

  if(navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(m => {
      for(let i of m.inputs.values()) i.onmidimessage = e => {
        if (echoBlock[`${e.data[0]}-${e.data[1]}`] && Date.now() - echoBlock[`${e.data[0]}-${e.data[1]}`] < 100) return;
        tx(e.data[0], e.data[1], e.data[2]);
      };
      for(let o of m.outputs.values()) midiOutputs.push(o);
    });
  }
</script>
</body>
</html>
