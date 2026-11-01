'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const T = require('./shared/mapdata.js');
const { Game } = require('./game');
const { botMove } = require('./bot');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 30000 });

app.get('/healthz', (_, res) => res.send('ok'));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '7d' }));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const BOT_NAMES = ['Casey Jones', 'Annie Oakley', 'Phineas', 'Nellie Bly', 'Buffalo Bill', 'Wyatt', 'Doc Holliday', 'Calamity Jane'];
const AUTO_AFTER_MS = 45000; // a disconnected player is auto-played after this long

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}
const freeColor = (room) => T.PNAMES.find(c => !room.members.some(m => m.color === c));
const auto = (m) => m.bot || (!m.sock && m.dcAt && Date.now() - m.dcAt > AUTO_AFTER_MS);

function lobbyView(room, idx) {
  return {
    code: room.code, you: idx, host: 0, chat: room.chat.slice(-60),
    members: room.members.map(m => ({ name: m.name, color: m.color, bot: m.bot, connected: m.bot || !!m.sock }))
  };
}
function broadcast(room) {
  room.members.forEach((m, i) => {
    if (!m.sock) return;
    if (room.game) {
      const v = room.game.view(i);
      v.chat = room.chat.slice(-60);
      v.members = room.members.map(x => ({ connected: x.bot || !!x.sock, auto: auto(x) }));
      v.code = room.code;
      m.sock.emit('state', v);
    } else m.sock.emit('lobby', lobbyView(room, i));
  });
}

io.on('connection', (sock) => {
  let room = null, idx = -1;
  const err = (msg) => sock.emit('err', msg);
  const attach = (r, i) => {
    room = r; idx = i;
    const m = r.members[i]; m.sock = sock; m.dcAt = 0; m.setIdx = (k) => { idx = k; if (k < 0) room = null; };
    sock.join(r.code);
    r.touched = Date.now();
    broadcast(r);
  };

  sock.on('create', ({ name, token }) => {
    name = clean(name, 16) || 'Conductor';
    const r = { code: newCode(), members: [], game: null, chat: [], touched: Date.now() };
    r.members.push({ token: String(token), name, color: freeColor(r), bot: false, sock: null });
    rooms.set(r.code, r); attach(r, 0);
  });
  sock.on('join', ({ code, name, token }) => {
    const r = rooms.get(clean(code, 4).toUpperCase());
    if (!r) return err('No table with that code.');
    token = String(token);
    const existing = r.members.findIndex(m => m.token === token);
    if (existing >= 0) return attach(r, existing);
    if (r.game) return err('That game has already started.');
    if (r.members.length >= 5) return err('That table is full (5 players max).');
    r.members.push({ token, name: clean(name, 16) || 'Conductor', color: freeColor(r), bot: false, sock: null });
    attach(r, r.members.length - 1);
  });
  sock.on('rejoin', ({ code, token }) => {
    const r = rooms.get(clean(code, 4).toUpperCase());
    const i = r ? r.members.findIndex(m => m.token === String(token)) : -1;
    if (i < 0) return sock.emit('norejoin');
    attach(r, i);
  });

  const host = () => room && idx === 0 ? room : (err('Only the host can do that.'), null);
  sock.on('addBot', () => {
    const r = host(); if (!r || r.game) return;
    if (r.members.length >= 5) return err('The table is full.');
    const used = new Set(r.members.map(m => m.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + r.members.length;
    r.members.push({ token: 'bot' + Math.random(), name, color: freeColor(r), bot: true, sock: null });
    broadcast(r);
  });
  sock.on('kick', (i) => {
    const r = host(); if (!r || r.game || !(i > 0 && i < r.members.length)) return;
    const [m] = r.members.splice(i, 1);
    if (m.setIdx) m.setIdx(-1);
    if (m.sock) { m.sock.emit('norejoin'); m.sock.leave(r.code); m.sock.emit('kicked'); }
    r.members.forEach((x, k) => { if (x.setIdx) x.setIdx(k); });
    broadcast(r);
  });
  sock.on('setColor', (c) => {
    if (!room || room.game || !T.PCOL[c] || room.members.some((m, i) => i !== idx && m.color === c)) return;
    room.members[idx].color = c; broadcast(room);
  });
  sock.on('start', () => {
    const r = host(); if (!r || r.game) return;
    if (r.members.length < 2) return err('You need at least 2 players. Add a bot to play solo!');
    r.game = new Game(r.members.map(m => ({ id: m.token, name: m.name, color: m.color, bot: m.bot })));
    broadcast(r);
  });
  sock.on('act', (a) => {
    if (!room || !room.game) return;
    const res = room.game.act(idx, a);
    if (!res.ok) return err(res.err);
    room.touched = Date.now(); broadcast(room);
  });
  sock.on('toLobby', () => {
    const r = host(); if (!r || !r.game || r.game.phase !== 'ended') return;
    r.game = null; broadcast(r);
  });
  sock.on('chat', (text) => {
    if (!room) return;
    text = clean(text, 200); if (!text) return;
    room.chat.push({ n: room.members[idx].name, c: room.members[idx].color, t: text });
    if (room.chat.length > 100) room.chat.shift();
    io.to(room.code).emit('chat', room.chat[room.chat.length - 1]);
  });
  sock.on('emote', (e) => {
    if (!room || !['🚂', '👏', '😂', '😡', '🤔', '🎉', '💀', '🤠'].includes(e)) return;
    io.to(room.code).emit('emote', { i: idx, e });
  });
  sock.on('disconnect', () => {
    if (!room) return;
    const m = room.members[idx];
    if (m && m.sock === sock) { m.sock = null; m.dcAt = Date.now(); broadcast(room); }
  });
});

// Bots (and long-disconnected humans) act here, one action per second per table.
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    const anyone = room.members.some(m => m.sock);
    if (!anyone && now - room.touched > 3 * 3600e3) return rooms.delete(code);
    const g = room.game;
    if (!g || g.phase === 'ended') return;
    let changed = false;
    if (g.phase === 'setup') {
      g.players.forEach((p, i) => { if (p.pending && auto(room.members[i])) changed = botMove(g, i) || changed; });
    } else if (auto(room.members[g.turn])) changed = botMove(g, g.turn);
    if (changed) broadcast(room);
  });
}, 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`Ticket to Ride listening on ${PORT}`));
