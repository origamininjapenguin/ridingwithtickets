import { createBoard } from './board.js';
import { sfx } from './sfx.js';
import { music } from './music.js';

const T = window.TTR;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const city = (k) => T.CITIES[k][0];
const socket = io();
const token = localStorage.ttr_token || (localStorage.ttr_token = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

let endShown = false, lobby = null, st = null, board = null, prev = null, mode = 'home', chats = [], claimOpen = false;
const show = (id) => { ['home', 'lobby', 'game'].forEach((s) => $('#' + s).classList.toggle('hidden', s !== id)); mode = id; music.setMode(id === 'game' ? 'game' : 'menu'); document.body.classList.toggle('ingame', id === 'game'); document.body.classList.remove('chatopen'); };

/* ---------- helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
const icon = (c) => c === 'L'
  ? '<svg viewBox="0 0 48 32"><rect x="4" y="13" width="28" height="11" rx="2"/><rect x="30" y="6" width="14" height="18" rx="2"/><rect x="9" y="5" width="6" height="9"/><circle cx="12" cy="27" r="4"/><circle cx="26" cy="27" r="4"/><circle cx="38" cy="27" r="4"/></svg>'
  : '<svg viewBox="0 0 48 32"><rect x="3" y="5" width="42" height="17" rx="3"/><rect x="8" y="9" width="8" height="6" fill="rgba(0,0,0,.35)"/><rect x="20" y="9" width="8" height="6" fill="rgba(0,0,0,.35)"/><rect x="32" y="9" width="8" height="6" fill="rgba(0,0,0,.35)"/><circle cx="13" cy="26" r="4"/><circle cx="35" cy="26" r="4"/></svg>';
const colorName = (c) => T.COLORS[c].toLowerCase();
const ticketHtml = (id, extra = '', style = '') => { const [a, b, p] = T.TICKETS[id]; return `<div class="tk ${extra}" style="${style}" data-id="${id}" data-a="${a}" data-b="${b}"><b>${p}</b>${esc(city(a))}<br>to ${esc(city(b))}</div>`; };

function connectedSet(pi, claims) {
  const parent = {}; const f = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = f(parent[x])));
  T.ROUTES.forEach((r) => { if (claims[r.id] === pi) parent[f(r.a)] = f(r.b); });
  return f;
}

/* ---------- home / lobby ---------- */
$('#name').value = localStorage.ttr_name || '';
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#code').value = urlRoom.toUpperCase().slice(0, 4);
const myName = () => { const n = $('#name').value.trim() || 'Conductor'; localStorage.ttr_name = n; return n; };
$('#btnCreate').onclick = () => { sfx.unlock(); socket.emit('create', { name: myName(), token }); };
$('#btnJoin').onclick = () => { sfx.unlock(); socket.emit('join', { code: $('#code').value, name: myName(), token }); };
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJoin').click(); });
$('#btnBot').onclick = () => socket.emit('addBot');
$('#btnStart').onclick = () => { sfx.whistle(); socket.emit('start'); };
$('#btnCopy').onclick = async () => {
  const url = `${location.origin}/?room=${lobby.code}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied.'); } catch (e) { prompt('Copy this invite link:', url); }
};
function openRules(onBack) {
  modal(`<div class="dlg rules"><h3>How to play</h3>
  <p><b>Goal:</b> score the most points by claiming routes, connecting your destination tickets, and building the longest continuous line.</p>
  <p><b>On your turn, do one of three things:</b></p>
  <p>1. Draw 2 train cards, from the five face-up cards or the deck. A face-up locomotive (rainbow) counts as your whole turn, and you can't take one as your second card.</p>
  <p>2. Claim a route by spending cards of its colour equal to its length. Gray routes take any one colour. Locomotives are wild.</p>
  <p>3. Draw 3 destination tickets and keep at least 1.</p>
  <p>Routes score 1, 2, 4, 7, 10 or 15 points for lengths 1 to 6. In 2 or 3 player games only one lane of a double route can be used.</p>
  <p>When someone has 2 or fewer trains, everyone gets one last turn. Finished tickets add their value, unfinished ones subtract it, and the longest continuous line earns 10 bonus points.</p>
  <p>Drag to pan, scroll or pinch to zoom, right-drag to tilt. Hover a ticket to see its cities on the map. Glowing routes are ones you can claim right now. On the board, a dark track with a colored base and train belongs to that player; bright empty slots are still free.</p>
  <div class="acts"><button class="primary" id="mClose">${onBack ? 'Back to menu' : 'Got it'}</button></div></div>`, true);
  $('#modal').dataset.kind = 'help';
  if (onBack) $('#mClose').onclick = onBack;
}
$('#btnHelp').onclick = () => openRules();
socket.on('connect', () => { if (localStorage.ttr_room) socket.emit('rejoin', { code: localStorage.ttr_room, token }); });
function toHome() {
  localStorage.removeItem('ttr_room');
  st = null; lobby = null; prev = null; endShown = false; tkSig = '';
  closeModal(); $('#tpanel').classList.add('hidden');
  if (board) { board.reset(); board.clearTicket(); }
  show('home');
}
socket.on('norejoin', () => { localStorage.removeItem('ttr_room'); if (mode !== 'home') toHome(); });
socket.on('left', toHome);
const roomCode = () => (st && st.code) || (lobby && lobby.code) || '';
socket.on('err', (m) => { sfx.error(); toast(m); });
socket.on('kicked', () => toast('You were removed from the table.'));
socket.on('chat', (m) => { chats.push(m); renderChat(); });
socket.on('emote', ({ i, e }) => {
  const row = document.querySelector(`.pl[data-i="${i}"]`); if (!row) return;
  const s = document.createElement('span'); s.className = 'emo'; s.textContent = e; row.appendChild(s); setTimeout(() => s.remove(), 2300);
  if (e === '🚂') sfx.whistle();
});

socket.on('lobby', (d) => {
  lobby = d; st = null; prev = null; chats = d.chat; localStorage.ttr_room = d.code;
  if (!$('#modal').dataset.kind) closeModal();
  endShown = false; if (board) board.reset();
  show('lobby'); renderLobby(); renderChat();
});
function renderLobby() {
  $('#lobbyCode').textContent = lobby.code;
  const isHost = lobby.you === lobby.host;
  $('#members').innerHTML = lobby.members.map((m, i) => `<li><span class="dot" style="background:${T.PCOL[m.color]}"></span><b>${esc(m.name)}</b>
    <small>${i === lobby.host ? 'host' : m.bot ? 'bot' : m.connected ? '' : 'away'}${i === lobby.you ? ' (you)' : ''}</small>
    ${isHost && i !== lobby.host ? `<button data-kick="${i}" aria-label="Remove ${esc(m.name)}">Remove</button>` : ''}</li>`).join('');
  $('#members').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => socket.emit('kick', +b.dataset.kick)));
  $('#swatches').innerHTML = T.PNAMES.map((c) => {
    const holder = lobby.members.findIndex((m, i) => m.color === c && i !== lobby.you);
    const taken = holder >= 0 && !lobby.members[holder].bot; // bots hand over their colour
    const tip = holder >= 0 ? (taken ? `${c} (in use)` : `${c}: swap with ${lobby.members[holder].name}`) : c;
    return `<button style="background:${T.PCOL[c]}" class="${lobby.members[lobby.you].color === c ? 'on' : ''}" data-c="${c}" title="${esc(tip)}" ${taken ? 'disabled' : ''} aria-label="${esc(tip)}"></button>`;
  }).join('');
  $('#swatches').querySelectorAll('button').forEach((b) => (b.onclick = () => socket.emit('setColor', b.dataset.c)));
  $('#btnBot').classList.toggle('hidden', !isHost); $('#btnStart').classList.toggle('hidden', !isHost);
  $('#btnBot').disabled = lobby.members.length >= 5; $('#btnStart').disabled = lobby.members.length < 2;
  $('#lobbyHint').textContent = isHost ? (lobby.members.length < 2 ? 'Add a bot or wait for a friend to join.' : 'Ready when you are.') : 'Waiting for the host to start the game.';
}

/* ---------- chat / log ---------- */
function renderChat() {
  const html = chats.map((m) => `<div><b style="color:${T.PCOL[m.c]}">${esc(m.n)}</b> ${esc(m.t)}</div>`).join('');
  [$('#chat'), $('#lobbyChat')].forEach((e) => { e.innerHTML = html; e.scrollTop = e.scrollHeight; });
}
$('#chatForm').onsubmit = (e) => { e.preventDefault(); const v = $('#chatInput').value.trim(); if (v) socket.emit('chat', v); $('#chatInput').value = ''; };
$('#chatToggle').onclick = () => document.body.classList.toggle('chatopen');
$('#emotes').innerHTML = ['🚂', '👏', '😂', '😡', '🤔', '🎉', '💀', '🤠'].map((e) => `<button aria-label="Send ${e}">${e}</button>`).join('');
$('#emotes').querySelectorAll('button').forEach((b) => (b.onclick = () => socket.emit('emote', b.textContent)));

/* ---------- modal ---------- */
function modal(html, closable) {
  const m = $('#modal'); m.innerHTML = html; m.dataset.kind = ''; m.classList.remove('hidden');
  const c = m.querySelector('#mClose'); if (c) c.onclick = closeModal;
  if (closable) m.onclick = (e) => { if (e.target === m) closeModal(); };
  else m.onclick = null;
}
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; m.dataset.sig = ''; m.dataset.kind = ''; claimOpen = false; }

/* ---------- game ---------- */
socket.on('state', (s) => {
  const first = !st;
  st = s; chats = s.chat; localStorage.ttr_room = s.code;
  if (mode !== 'game') { show('game'); if (!board) board = createBoard($('#three'), { hover: onHover, click: onRouteClick }); else if (first) board.reset(); }
  renderGame(); renderChat();
  prev = { turn: s.turn, phase: s.phase, log: s.log.length, you: s.you, claims: Object.keys(s.claims).length, pending: !!s.pending };
});

function onHover(id, x, y) {
  const tip = $('#tip');
  if (id === null || !st) return tip.classList.add('hidden');
  const r = T.ROUTES[id], owner = st.claims[id];
  tip.innerHTML = `${esc(city(r.a))} – ${esc(city(r.b))} · ${r.len} · ${r.color === 'x' ? 'any colour' : colorName(r.color)} · ${T.POINTS[r.len]} pts${owner !== undefined ? ` · owned by ${esc(st.players[owner].name)}` : ''}`;
  tip.style.left = Math.min(x + 14, innerWidth - 260) + 'px'; tip.style.top = y + 16 + 'px'; tip.classList.remove('hidden');
}

const myTurn = () => st && st.phase === 'play' && st.turn === st.you && !st.pending;
const act = (a) => socket.emit('act', a);

function renderGame() {
  const s = st, me = s.players[s.you];
  const fresh = board.update(s);

  // sounds + notifications from state changes
  if (prev) {
    if (s.turn === s.you && (prev.turn !== s.you || prev.phase !== s.phase) && s.phase === 'play') sfx.turn();
    if (fresh.length) sfx.claim();
    if (s.phase === 'ended' && prev.phase !== 'ended') sfx.fanfare();
    if (s.log.length && (s.log[s.log.length - 1] !== prevLast) && fresh.length === 0 && s.phase === 'play') sfx.card();
  }
  prevLast = s.log[s.log.length - 1];

  // banner
  const b = $('#banner'); b.classList.toggle('mine', myTurn());
  if (s.phase === 'ended') b.textContent = 'Game over';
  else if (s.phase === 'setup') b.textContent = s.pending ? 'Choose your starting tickets' : 'Waiting for the other players to choose tickets...';
  else if (s.pending) b.textContent = 'Choose which destination tickets to keep';
  else if (s.turn === s.you) b.textContent = s.drew ? 'Draw one more card' : 'Your turn: draw cards, claim a route, or take tickets';
  else b.textContent = `${s.players[s.turn].name}'s turn`;
  if (s.final !== null && s.phase !== 'ended') b.textContent += s.final === s.players.length ? ' · Last round!' : ` · Last round (${s.final} turn${s.final === 1 ? '' : 's'} left)`;

  // scoreboard
  const emo = {}; document.querySelectorAll('.pl .emo').forEach((e) => { (emo[e.parentNode.dataset.i] = emo[e.parentNode.dataset.i] || []).push(e); });
  $('#scores').innerHTML = s.players.map((p, i) => `<div class="pl ${s.phase === 'play' && s.turn === i ? 'turn' : ''} ${s.members[i].connected ? '' : 'off'}" data-i="${i}">
    <span class="dot" style="background:${T.PCOL[p.color]}"></span><b>${esc(p.name)}${i === s.you ? ' (you)' : ''}</b><span class="sc">${p.score}</span>
    <small>${p.trains} trains · ${p.cards} cards · ${p.tickets} tickets${p.bot ? ' · bot' : s.members[i].auto ? ' · auto-playing' : s.members[i].connected ? '' : ' · away'}</small></div>`).join('');
  Object.entries(emo).forEach(([i, list]) => { const row = document.querySelector(`.pl[data-i="${i}"]`); if (row) list.forEach((e) => row.appendChild(e)); });

  // market
  const can = myTurn();
  $('#faceup').innerHTML = s.faceUp.map((c, i) => `<button class="card c-${c}" data-i="${i}" aria-label="Take face-up ${colorName(c)} card" ${can && !(s.drew === 1 && c === 'L') ? '' : 'disabled'}>${icon(c)}</button>`).join('');
  $('#faceup').querySelectorAll('button').forEach((b) => (b.onclick = () => { sfx.card(); act({ type: 'drawFaceUp', index: +b.dataset.i }); }));
  $('#deckN').textContent = s.deckCount; $('#tickN').textContent = s.ticketCount;
  $('#deck').disabled = !can || !s.deckCount; $('#tickDeck').disabled = !can || !!s.drew || !s.ticketCount;
  $('#deck').onclick = () => { sfx.card(); act({ type: 'drawDeck' }); };
  $('#tickDeck').onclick = () => { sfx.tickets(); act({ type: 'drawTickets' }); };

  // hand
  const order = [...T.COL, 'L'].filter((c) => s.hand[c] > 0);
  $('#hand').innerHTML = order.length ? order.map((c) => `<div class="card c-${c}" title="${s.hand[c]} ${colorName(c)}">${icon(c)}<b class="n">×${s.hand[c]}</b></div>`).join('') : '<span class="empty">Your train cards will appear here.</span>';

  // tickets
  const f = connectedSet(s.you, s.claims);
  $('#mytickets').innerHTML = s.tickets.map((id) => { const [a, bb] = T.TICKETS[id]; return ticketHtml(id, f(a) === f(bb) ? 'done' : ''); }).join('');
  $('#mytickets').querySelectorAll('.tk').forEach((t) => {
    t.onmouseenter = () => board.showTicket(t.dataset.a, t.dataset.b); t.onmouseleave = restoreBeacons;
    t.onclick = () => { board.showTicket(t.dataset.a, t.dataset.b); setTimeout(restoreBeacons, 2500); };
  });

  // routes you can claim (glow)
  board.setClaimable(can && !s.drew ? T.ROUTES.filter((r) => !T.canClaim(r, s.claims, s.players.length, s.you, me.trains) && T.payOptions(r, s.hand).length).map((r) => r.id) : []);

  // log
  const log = $('#log'); log.innerHTML = s.log.map((l) => `<div>${esc(l)}</div>`).join(''); log.scrollTop = 1e9;

  // dialogs
  renderTicketPanel();
  if (s.phase === 'ended') showResult();
  else if (!claimOpen && !$('#modal').classList.contains('hidden') && !$('#modal').dataset.kind) closeModal();
}
let prevLast = '';

function onRouteClick(id) {
  if (!st || st.phase !== 'play') return;
  const r = T.ROUTES[id], me = st.players[st.you];
  if (st.turn !== st.you) return toast(`It's ${st.players[st.turn].name}'s turn.`);
  if (st.pending) return;
  if (st.drew) return toast('Finish drawing your second card first.');
  const e = T.canClaim(r, st.claims, st.players.length, st.you, me.trains);
  if (e) return toast(e);
  const opts = T.payOptions(r, st.hand);
  if (!opts.length) return toast(`You need ${r.len} ${r.color === 'x' ? 'matching' : colorName(r.color)} cards (locomotives are wild).`);
  claimOpen = true;
  let oi = 0, locos = opts[0].min;
  const draw = () => {
    const o = opts[oi], c = r.len - locos;
    modal(`<div class="dlg"><h3>${esc(city(r.a))} – ${esc(city(r.b))}</h3>
      <p>${r.len} trains · worth ${T.POINTS[r.len]} point${T.POINTS[r.len] > 1 ? 's' : ''}</p>
      ${opts.length > 1 ? `<p>Pay with:</p><div class="chips">${opts.map((x, i) => `<button class="chip ${i === oi ? 'on' : ''}" data-i="${i}">${x.color === 'L' ? 'Locomotives only' : T.COLORS[x.color]}</button>`).join('')}</div>` : ''}
      ${o.max > o.min ? `<div class="step">Locomotives: <button id="lm" aria-label="Fewer locomotives">−</button><b>${locos}</b><button id="lp" aria-label="More locomotives">+</button></div>` : ''}
      <p>You will spend ${c > 0 ? `${c} ${colorName(o.color === 'L' ? r.color : o.color)}` : ''}${c > 0 && locos > 0 ? ' and ' : ''}${locos > 0 ? `${locos} locomotive${locos > 1 ? 's' : ''}` : ''}.</p>
      <div class="acts"><button id="mClose">Cancel</button><button class="primary" id="go">Claim route</button></div></div>`, true);
    $('#modal').querySelectorAll('.chip').forEach((b) => (b.onclick = () => { oi = +b.dataset.i; locos = opts[oi].min; draw(); }));
    if ($('#lm')) { $('#lm').onclick = () => { locos = Math.max(o.min, locos - 1); draw(); }; $('#lp').onclick = () => { locos = Math.min(o.max, locos + 1); draw(); }; }
    $('#go').onclick = () => { act({ type: 'claim', route: r.id, color: o.color, locos }); closeModal(); };
  };
  draw();
}

function showResult() {
  const R = st.result; const host = st.you === st.host;
  const win = R.winners.includes(st.you);
  const rows = R.players.map((p, i) => `<tr class="${R.winners.includes(i) ? 'win' : ''}"><td><span class="dot" style="display:inline-block;background:${T.PCOL[p.color]}"></span> ${esc(p.name)}</td>
    <td>${p.routePts}</td><td>${p.ticketPts > 0 ? '+' : ''}${p.ticketPts}</td><td>${p.bonus ? '+10' : '0'} <small>(${p.longest})</small></td><td>${p.total}</td></tr>`).join('');
  const detail = R.players.map((p) => `<p><b>${esc(p.name)}</b>: ${p.tickets.length ? p.tickets.map((t) => `${esc(city(t.a))} – ${esc(city(t.b))} <b style="color:${t.done ? '#27633f' : '#a3281d'}">${t.done ? '+' : '−'}${t.pts}</b>`).join(', ') : 'no tickets'}</p>`).join('');
  const html = `<div class="dlg"><h3>${win ? 'You win!' : `${esc(R.winners.map((i) => R.players[i].name).join(' and '))} win${R.winners.length > 1 ? '' : 's'}`}</h3>
    <table class="res"><tr><th>Player</th><th>Routes</th><th>Tickets</th><th>Longest</th><th>Total</th></tr>${rows}</table>${detail}
    <div class="acts"><button id="mClose">View the board</button>${host ? '<button class="primary" id="again">Back to the lobby</button>' : '<span class="hint">The host can start another game.</span>'}</div></div>`;
  if (!endShown) { endShown = true; modal(html, true); const a = $('#again'); if (a) a.onclick = () => socket.emit('toLobby'); }
}


/* ---------- changelog ---------- */
const CHANGELOG = [
  { v: '1.2', d: 'Nov 1, 2026', items: [
    'Log and chat are now two separate windows, stacked on the right.',
    'Fixed the chat tabs and emoji reactions spilling out of their panel.',
    'The whole screen now scales to fit any 16:9 display: players and tickets on the left, the board in the middle, market, log and chat on the right, your cards along the bottom.',
    'Added this changelog.'] },
  { v: '1.1', d: 'Nov 1, 2026', items: [
    'Claimed routes now show a dark track, a colored base and a bigger outlined train, so you can see who owns what at a glance.',
    'Added Tone.js background music, with separate volume sliders for music and sound effects.',
    'New Menu button: table code and invite link, volumes, rules, and leave table.',
    'If a player leaves mid-game, a bot takes over their seat.',
    'Card hover no longer turns black; cards now glow gold.',
    'Picking a color a bot is using swaps colors with that bot.',
    'Destination tickets open in a side panel with colored map markers instead of covering the board.'] },
  { v: '1.0', d: 'Nov 1, 2026', items: [
    'First release: USA map with 36 cities, 78 routes and 30 destination tickets, a 3D board, 2 to 5 players, bots, table codes, chat and emotes, and reconnect.'] }
];
$('#btnLog').onclick = () => modal(`<div class="dlg cl"><h3>Changelog</h3>${CHANGELOG.map((c) =>
  `<h4>Version ${c.v}<small>${c.d}</small></h4><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
  <div class="acts"><button class="primary" id="mClose">Close</button></div></div>`, true);

/* ---------- destination tickets: docked side panel (the board stays visible) ---------- */
const TKCOL = ['#ffd77a', '#5fd3ff', '#ff7ad9'];
let tkSel = new Set(), tkSig = '', tkCollapsed = false;
function restoreBeacons() {
  if (!board) return;
  if (st && st.pending) board.showTickets(st.pending.map((id, i) => ({ a: T.TICKETS[id][0], b: T.TICKETS[id][1], color: TKCOL[i] })));
  else board.clearTicket();
}
function renderTicketPanel() {
  const p = $('#tpanel'), s = st;
  if (!s.pending) { p.classList.add('hidden'); if (tkSig) { tkSig = ''; restoreBeacons(); } return; }
  const sig = s.pending.join();
  if (sig !== tkSig) { tkSig = sig; tkSel = new Set(s.pending); tkCollapsed = false; sfx.tickets(); }
  p.classList.remove('hidden');
  const title = s.phase === 'setup' ? 'Starting tickets' : 'New tickets';
  restoreBeacons();
  if (tkCollapsed) {
    p.innerHTML = `<div class="thead"><b>${title}</b><button id="tkShow">Show</button></div>`;
    $('#tkShow').onclick = () => { tkCollapsed = false; renderTicketPanel(); };
    return;
  }
  p.innerHTML = `<div class="thead"><b>${title}</b><button id="tkHide" title="Hide this panel to see the whole board">Hide</button></div>
    <p>Keep at least ${s.minKeep}. Colored markers on the map show each ticket. Click to keep or return.</p>
    <div class="tklist">${s.pending.map((id, i) => ticketHtml(id, tkSel.has(id) ? 'sel' : '', `border-left-color:${TKCOL[i]}`)).join('')}</div>
    <button class="primary keep" id="keep" ${tkSel.size < s.minKeep ? 'disabled' : ''}>Keep ${tkSel.size} ticket${tkSel.size === 1 ? '' : 's'}</button>`;
  $('#tkHide').onclick = () => { tkCollapsed = true; renderTicketPanel(); };
  p.querySelectorAll('.tk').forEach((t, i) => {
    t.onmouseenter = () => board.showTicket(t.dataset.a, t.dataset.b, TKCOL[i]);
    t.onmouseleave = restoreBeacons;
    t.onclick = () => { const id = +t.dataset.id; tkSel.has(id) ? tkSel.delete(id) : tkSel.add(id); sfx.click(); renderTicketPanel(); };
  });
  $('#keep').onclick = () => act({ type: 'keepTickets', keep: [...tkSel] });
}

/* ---------- menu: room code, volume, rules, leave ---------- */
function openMenu() {
  const code = roomCode();
  modal(`<div class="dlg"><h3>Menu</h3>
    ${code ? `<p>Table code <span class="code">${esc(code)}</span> <button class="link" id="mCopy">Copy invite link</button></p>` : ''}
    <label class="vol">Music <input type="range" id="vMusic" min="0" max="100" value="${music.volume}"><output id="oMusic">${music.volume}</output></label>
    <label class="vol">Sound effects <input type="range" id="vSfx" min="0" max="100" value="${sfx.volume}"><output id="oSfx">${sfx.volume}</output></label>
    <div class="acts left"><button id="mRules">How to play</button>${code ? '<button id="mLeave">Leave table</button>' : ''}</div>
    <div class="acts"><button class="primary" id="mClose">${code ? 'Back to game' : 'Close'}</button></div></div>`, true);
  $('#modal').dataset.kind = 'menu';
  $('#vMusic').oninput = (e) => { music.setVolume(e.target.value); $('#oMusic').textContent = e.target.value; };
  $('#vSfx').oninput = (e) => { sfx.setVolume(e.target.value); $('#oSfx').textContent = e.target.value; };
  $('#vSfx').onchange = () => sfx.chug(2);
  $('#mRules').onclick = () => openRules(openMenu);
  if ($('#mCopy')) $('#mCopy').onclick = async () => {
    const url = `${location.origin}/?room=${code}`;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied.'); } catch (e) { prompt('Copy this invite link:', url); }
  };
  if ($('#mLeave')) {
    let sure = false;
    $('#mLeave').onclick = () => {
      if (!sure) { sure = true; $('#mLeave').textContent = st && st.phase !== 'ended' ? 'Really leave? A bot takes your seat' : 'Really leave?'; return; }
      socket.emit('leave');
    };
  }
}
$('#menuBtn').onclick = openMenu;

// browsers only allow audio after a click or key press
const unlockAudio = () => { sfx.unlock(); music.start(); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
