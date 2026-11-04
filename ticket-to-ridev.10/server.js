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
app.use('/vendor/tone', express.static(path.join(__dirname, 'node_modules/tone'), { maxAge: '7d' }));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const BOT_NAMES = ['Casey Jones', 'Annie Oakley', 'Phineas', 'Nellie Bly', 'Buffalo Bill', 'Wyatt', 'Doc Holliday', 'Calamity Jane'];
const TIMERS = [0, 30, 60, 90, 120, 180]; // turn timer choices in seconds (0 = off)
const TIMER_SCALE = Number(process.env.TTR_TIMER_SCALE) || 1; // tests shrink this
const AUTO_AFTER_MS = 45000; // a disconnected player is auto-played after this long
const ABANDON_MS = 10 * 60 * 1000; // a table nobody is connected to is deleted after this
const MAX_MISSES = 3; // consecutive timed-out turns before a bot takes the seat
const MAX_SPECS = 20; // spectators per table
const SPEC_GRACE_MS = 60 * 1000; // a disconnected spectator can refresh back in within this time

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}
const freeColor = (room) => T.PNAMES.find(c => !room.members.some(m => m.color === c));
const hostIdx = (r) => Math.max(0, r.members.findIndex(m => !m.bot)); // first human is the host
const auto = (m) => m.bot || m.afk || (!m.sock && m.dcAt && Date.now() - m.dcAt > AUTO_AFTER_MS);

// Spectators sit outside the player seats. Public tables can be watched any time; a private table can be
// watched with its code once it has no open seats (all 5 taken, or the game has started).
const isFull = (r) => r.members.length >= 5;
const canSpectate = (r) => !!r.settings.spectators && (r.settings.public || !!r.game || isFull(r));
const specNames = (r) => r.spectators.filter(x => x.sock).map(x => x.name);
function closeRoom(code, why) { // delete the room and tell anyone still watching
  const r = rooms.get(code); if (!r) return;
  r.spectators.forEach(x => { if (x.sock) { x.sock.emit('closed', why); x.sock.leave(code); if (x.detach) x.detach(); } });
  rooms.delete(code);
}

// Turn timer: one deadline per turn (setup gets double time, at least a minute)
function syncTimer(room) {
  const g = room.game;
  if (!g || g.phase === 'ended' || !room.settings.timer) { room.dl = null; return null; }
  const key = g.phase + ':' + g.turnNo;
  if (!room.dl || room.dl.key !== key) {
    const secs = g.phase === 'setup' ? Math.max(60, room.settings.timer * 2) : room.settings.timer;
    const ms = secs * 1000 * TIMER_SCALE;
    room.dl = { key, total: ms, at: Date.now() + ms };
  }
  return room.dl;
}
const timerView = (room) => { const d = syncTimer(room); return d ? { left: Math.max(0, d.at - (room.pausedAt || Date.now())), total: d.total } : null; };
// When time runs out, the bot logic plays the turn (or picks tickets) for the player.
function timeoutMove(room) {
  const g = room.game;
  const miss = (i) => { // a human who keeps timing out is replaced by a bot until they click to rejoin
    const m = room.members[i];
    if (!m || auto(m)) return;
    m.misses = (m.misses || 0) + 1;
    if (m.misses >= MAX_MISSES) { m.afk = true; g.say(`${m.name} missed ${MAX_MISSES} turns in a row. A bot takes over until they rejoin.`); }
  };
  if (g.phase === 'setup') {
    g.players.forEach((p, i) => { if (p.pending) { g.say(`${p.name} ran out of time. Tickets were chosen for them.`); miss(i); botMove(g, i); } });
  } else {
    const i = g.turn, t = g.turnNo;
    g.say(`${g.players[i].name} ran out of time. A move was made for them.`); miss(i);
    for (let k = 0; k < 6 && g.turnNo === t && g.phase === 'play'; k++) botMove(g, i);
  }
  room.dl = null;
}

// Pause: freezes the timer, blocks moves and bots. The host resumes it, or a majority of the other connected humans can vote to.
function voteStatus(room) {
  const hi = hostIdx(room);
  const elig = room.members.map((m, i) => (i !== hi && !m.bot && !m.afk && m.sock ? m.token : null)).filter(Boolean);
  const votes = room.paused ? [...room.paused.votes].filter(t => elig.includes(t)).length : 0;
  return { elig, votes, need: elig.length ? Math.floor(elig.length / 2) + 1 : 0 };
}
function pausedView(room, pi) {
  if (!room.paused) return null;
  const { elig, votes, need } = voteStatus(room), tok = pi >= 0 ? room.members[pi].token : null;
  return { by: room.paused.by, votes, need, youVoted: room.paused.votes.has(tok), canVote: elig.includes(tok) };
}
function resumeRoom(room, msg) {
  if (room.dl && room.pausedAt) room.dl.at += Date.now() - room.pausedAt; // the turn clock picks up where it stopped
  room.pausedAt = 0; room.paused = null; room.touched = Date.now();
  room.game.say(msg);
}

function lobbyView(room, idx) {
  return {
    code: room.code, you: idx, spec: idx < 0, host: hostIdx(room), chat: room.chat.slice(-60), settings: room.settings, spectators: specNames(room),
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
      v.code = room.code; v.host = hostIdx(room); v.timer = timerView(room); v.paused = pausedView(room, i); v.afk = !!m.afk; v.spectators = specNames(room);
      m.sock.emit('state', v);
    } else m.sock.emit('lobby', lobbyView(room, i));
  });
  room.spectators.forEach((sp) => { // public information only: no hands, no tickets
    if (!sp.sock) return;
    if (room.game) {
      const v = room.game.view(-1);
      v.chat = room.chat.slice(-60);
      v.members = room.members.map(x => ({ connected: x.bot || !!x.sock, auto: auto(x) }));
      v.code = room.code; v.host = hostIdx(room); v.timer = timerView(room); v.paused = pausedView(room, -1); v.afk = false; v.spectators = specNames(room); v.spec = true;
      sp.sock.emit('state', v);
    } else sp.sock.emit('lobby', lobbyView(room, -1));
  });
}

io.on('connection', (sock) => {
  let room = null, idx = -1, spec = null; // spec: this socket's spectator record (idx stays -1)
  const err = (msg) => sock.emit('err', msg);
  const attach = (r, i) => {
    room = r; idx = i;
    const m = r.members[i];
    if (r.game && m.reclaim && m.bot) { // they left earlier and a bot took over: the human takes the seat back
      m.bot = false; m.reclaim = false; r.game.players[i].bot = false;
      r.game.say(`${m.name} is back and takes over from the bot.`);
    } else if (r.game && !m.bot && !m.sock && m.dcAt && Date.now() - m.dcAt > AUTO_AFTER_MS) {
      r.game.say(`${m.name} is back and takes over again.`); // was being auto-played while away
    }
    m.sock = sock; m.dcAt = 0; m.setIdx = (k) => { idx = k; if (k < 0) room = null; };
    sock.join(r.code);
    r.touched = Date.now();
    broadcast(r);
  };

  const attachSpec = (r, sp) => {
    room = r; idx = -1; spec = sp;
    sp.sock = sock; sp.dcAt = 0; sp.detach = () => { room = null; idx = -1; spec = null; };
    sock.join(r.code); r.touched = Date.now(); broadcast(r);
  };

  sock.on('create', ({ name, token }) => {
    name = clean(name, 16) || 'Conductor';
    const r = { code: newCode(), members: [], game: null, chat: [], touched: Date.now(), settings: { public: false, timer: 0, spectators: true }, spectators: [], dl: null, paused: null, pausedAt: 0 };
    r.members.push({ token: String(token), name, color: freeColor(r), bot: false, sock: null });
    rooms.set(r.code, r); attach(r, 0);
  });
  sock.on('join', ({ code, name, token }) => {
    const r = rooms.get(clean(code, 4).toUpperCase());
    if (!r) return err('No table with that code.');
    token = String(token);
    const existing = r.members.findIndex(m => m.token === token);
    if (existing >= 0) return attach(r, existing);
    const hint = canSpectate(r) ? ' You can watch it instead.' : '';
    if (r.game) return err('That game has already started.' + hint);
    if (r.members.length >= 5) return err('That table is full (5 players max).' + hint);
    r.members.push({ token, name: clean(name, 16) || 'Conductor', color: freeColor(r), bot: false, sock: null });
    attach(r, r.members.length - 1);
  });
  sock.on('spectate', ({ code, name, token }) => {
    const r = rooms.get(clean(code, 4).toUpperCase());
    if (!r) return err('No table with that code.');
    token = String(token);
    const seat = r.members.findIndex(m => m.token === token);
    if (seat >= 0) return attach(r, seat); // you already have a seat at this table
    const had = r.spectators.find(x => x.token === token);
    if (had) return attachSpec(r, had);
    if (!r.settings.spectators) return err('The host has turned spectating off for that table.');
    if (!canSpectate(r)) return err("That private table isn't full yet, so it can't be watched. Join it as a player instead.");
    name = clean(name, 16);
    if (!name) return err('Enter a name to watch.');
    if (r.spectators.filter(x => x.sock).length >= MAX_SPECS) return err('That table already has the maximum number of spectators.');
    const sp = { token, name, sock: null, dcAt: 0 };
    r.spectators.push(sp); attachSpec(r, sp);
  });
  sock.on('rejoin', ({ code, token }) => {
    const r = rooms.get(clean(code, 4).toUpperCase());
    const i = r ? r.members.findIndex(m => m.token === String(token)) : -1;
    if (i >= 0) return attach(r, i);
    const sp = r && r.spectators.find(x => x.token === String(token));
    if (sp) return attachSpec(r, sp);
    sock.emit('norejoin');
  });

  const host = () => room && idx === hostIdx(room) ? room : (err('Only the host can do that.'), null);
  sock.on('addBot', () => {
    const r = host(); if (!r || r.game) return;
    if (r.members.length >= 5) return err('The table is full.');
    const used = new Set(r.members.map(m => m.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + r.members.length;
    r.members.push({ token: 'bot' + Math.random(), name, color: freeColor(r), bot: true, sock: null });
    broadcast(r);
  });
  sock.on('kick', (i) => {
    const r = host(); if (!r || r.game || !(i !== hostIdx(r) && i >= 0 && i < r.members.length)) return;
    const [m] = r.members.splice(i, 1);
    if (m.setIdx) m.setIdx(-1);
    if (m.sock) { m.sock.emit('norejoin'); m.sock.leave(r.code); m.sock.emit('kicked'); }
    r.members.forEach((x, k) => { if (x.setIdx) x.setIdx(k); });
    broadcast(r);
  });
  sock.on('setColor', (c) => {
    if (!room || idx < 0 || room.game || !T.PCOL[c]) return;
    const me = room.members[idx];
    if (me.color === c) return;
    const j = room.members.findIndex((m, i) => i !== idx && m.color === c);
    if (j >= 0) {
      if (!room.members[j].bot) return; // can't take a colour another human is using
      room.members[j].color = me.color; // the bot takes my old colour
    }
    me.color = c; broadcast(room);
  });
  sock.on('listRooms', () => {
    const list = [];
    rooms.forEach((r) => {
      if (!r.settings.public || !r.members.some(m => m.sock)) return;
      const joinable = !r.game && r.members.length < 5, watch = canSpectate(r);
      if (!joinable && !watch) return;
      list.push({ code: r.code, host: r.members[hostIdx(r)].name, players: r.members.length, timer: r.settings.timer, playing: !!r.game, joinable, watch, watchers: specNames(r).length });
    });
    list.sort((a, b) => (b.joinable - a.joinable) || (b.players - a.players));
    sock.emit('rooms', list.slice(0, 40));
  });
  sock.on('setSettings', (st) => {
    const r = host(); if (!r || r.game || !st) return;
    if (typeof st.public === 'boolean') r.settings.public = st.public;
    if (TIMERS.includes(st.timer)) r.settings.timer = st.timer;
    if (typeof st.spectators === 'boolean') r.settings.spectators = st.spectators;
    broadcast(r);
  });
  sock.on('start', () => {
    const r = host(); if (!r || r.game) return;
    if (r.members.length < 2) return err('You need at least 2 players. Add a bot to play solo!');
    r.game = new Game(r.members.map(m => ({ id: m.token, name: m.name, color: m.color, bot: m.bot })));
    broadcast(r);
  });
  sock.on('act', (a) => {
    if (!room || idx < 0 || !room.game) return;
    if (room.paused) return err('The game is paused.');
    const me = room.members[idx];
    if (me.afk) { me.afk = false; room.game.say(`${me.name} is back and takes over from the bot.`); }
    const res = room.game.act(idx, a);
    if (!res.ok) return err(res.err);
    me.misses = 0; // only consecutive timeouts count
    room.touched = Date.now(); broadcast(room);
  });
  sock.on('resume', () => { // click-to-rejoin after a bot took the seat for missed turns
    const me = room && idx >= 0 && room.members[idx];
    if (!me || !me.afk) return;
    me.afk = false; me.misses = 0;
    if (room.game) room.game.say(`${me.name} is back and takes over from the bot.`);
    room.touched = Date.now(); broadcast(room);
  });
  sock.on('pause', () => {
    const r = host(); if (!r || !r.game || r.game.phase === 'ended' || r.paused) return;
    const name = r.members[idx].name;
    r.paused = { by: name, votes: new Set() }; r.pausedAt = Date.now();
    r.game.say(`${name} paused the game.`); broadcast(r);
  });
  sock.on('unpause', () => {
    const r = host(); if (!r || !r.paused) return;
    resumeRoom(r, `${r.members[idx].name} resumed the game.`); broadcast(r);
  });
  sock.on('voteResume', () => {
    if (!room || idx < 0 || !room.paused || idx === hostIdx(room) || room.members[idx].bot) return;
    const tok = room.members[idx].token, v = room.paused.votes;
    v.has(tok) ? v.delete(tok) : v.add(tok);
    const { votes, need } = voteStatus(room);
    if (need > 0 && votes >= need) resumeRoom(room, 'The game was resumed by a majority vote.');
    broadcast(room);
  });
  sock.on('toLobby', () => {
    const r = host(); if (!r || !r.game || r.game.phase !== 'ended') return;
    r.game = null; broadcast(r);
  });
  sock.on('chat', (text) => {
    if (!room || idx < 0) return; // spectators can read the chat but not post
    text = clean(text, 200); if (!text) return;
    room.chat.push({ n: room.members[idx].name, c: room.members[idx].color, t: text });
    if (room.chat.length > 100) room.chat.shift();
    io.to(room.code).emit('chat', room.chat[room.chat.length - 1]);
  });
  sock.on('emote', (e) => {
    if (!room || idx < 0 || !['🚂', '👏', '😂', '😡', '🤔', '🎉', '💀', '🤠'].includes(e)) return;
    io.to(room.code).emit('emote', { i: idx, e });
  });
  sock.on('leave', () => {
    if (!room) return;
    if (spec) { // a spectator just walks away
      const r = room; r.spectators = r.spectators.filter(x => x !== spec);
      sock.leave(r.code); room = null; idx = -1; spec = null;
      sock.emit('left'); broadcast(r); return;
    }
    const r = room, i = idx, m = r.members[i];
    sock.leave(r.code); room = null; idx = -1;
    if (!m) return sock.emit('left');
    if (r.game) {
      // a bot takes over the seat, with the same name, hand and tickets
      m.bot = true; m.reclaim = true; m.sock = null; m.setIdx = null; // keeps the token: they can take the seat back
      r.game.players[i].bot = true;
      r.game.say(`${m.name} left the table. A bot takes over.`);
    } else {
      r.members.splice(i, 1);
      r.members.forEach((x, k) => { if (x.setIdx) x.setIdx(k); });
    }
    sock.emit('left');
    if (!r.members.some(x => !x.bot)) closeRoom(r.code, 'All the players have left, so the table was closed.'); else broadcast(r); // last human gone: delete the room
  });
  sock.on('disconnect', () => {
    if (!room) return;
    if (spec) { if (spec.sock === sock) { spec.sock = null; spec.dcAt = Date.now(); broadcast(room); } return; }
    const m = room.members[idx];
    if (m && m.sock === sock) { m.sock = null; m.dcAt = Date.now(); broadcast(room); }
  });
});

// Bots (and long-disconnected humans) act here, one action per second per table.
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    room.spectators = room.spectators.filter(x => x.sock || now - x.dcAt < SPEC_GRACE_MS); // forget spectators who never came back
    if (!room.members.some(m => !m.bot)) return closeRoom(code, 'All the players have left, so the table was closed.');
    const anyone = room.members.some(m => m.sock);
    if (!anyone && now - room.touched > ABANDON_MS) return closeRoom(code, 'That table was closed because nobody was playing.'); // abandoned
    const g = room.game;
    if (!g || g.phase === 'ended') return;
    if (room.paused) {
      const { votes, need } = voteStatus(room);
      if (need > 0 && votes >= need) { resumeRoom(room, 'The game was resumed by a majority vote.'); broadcast(room); }
      return;
    }
    let changed = false;
    const dl = syncTimer(room);
    if (dl && now >= dl.at) { timeoutMove(room); broadcast(room); return; }
    if (g.phase === 'setup') {
      g.players.forEach((p, i) => { if (p.pending && auto(room.members[i])) changed = botMove(g, i) || changed; });
    } else if (auto(room.members[g.turn])) changed = botMove(g, g.turn);
    if (changed) broadcast(room);
  });
}, 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`Ticket to Ride listening on ${PORT}`));
