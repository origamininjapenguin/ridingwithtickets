'use strict';
// Authoritative Ticket to Ride (USA) rules engine. Pure logic, no networking.
const T = require('./shared/mapdata.js');
const { COL, ROUTES, TICKETS, POINTS, CITIES } = T;

const bad = (err) => ({ ok: false, err });
const OK = { ok: true };
const emptyHand = () => ({ r: 0, o: 0, y: 0, g: 0, b: 0, p: 0, w: 0, k: 0, L: 0 });
const cname = (a, b) => `${CITIES[a][0]} – ${CITIES[b][0]}`;
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

class Game {
  // seats: [{id, name, color, bot}]
  constructor(seats) {
    this.players = seats.map(s => ({ ...s, trains: 45, hand: emptyHand(), tickets: [], pending: null, minKeep: 0, score: 0, ready: false }));
    this.deck = [];
    COL.forEach(c => { for (let i = 0; i < 12; i++) this.deck.push(c); });
    for (let i = 0; i < 14; i++) this.deck.push('L');
    shuffle(this.deck);
    this.discard = [];
    this.faceUp = [];
    this.tickDeck = shuffle(TICKETS.map((_, i) => i));
    this.claims = {};
    this.turn = 0; this.drew = 0; this.final = null;
    this.phase = 'setup';
    this.log = []; this.result = null;
    this.players.forEach(p => { for (let i = 0; i < 4; i++) p.hand[this.draw()]++; this.dealTickets(p, 2); });
    for (let i = 0; i < 5; i++) this.faceUp.push(this.draw());
    this.checkLocos(true);
    this.say('Everyone: choose at least 2 destination tickets to start.');
  }

  say(m) { this.log.push(m); if (this.log.length > 80) this.log.shift(); }
  draw() {
    if (!this.deck.length && this.discard.length) { this.deck = shuffle(this.discard); this.discard = []; }
    return this.deck.pop();
  }
  refill(i) { const c = this.draw(); if (c) this.faceUp[i] = c; else this.faceUp.splice(i, 1); }
  checkLocos(silent) {
    let tries = 0;
    while (this.faceUp.filter(c => c === 'L').length >= 3 && tries++ < 6 && this.deck.length + this.discard.length >= 5) {
      this.discard.push(...this.faceUp); this.faceUp = [];
      for (let i = 0; i < 5; i++) { const c = this.draw(); if (c) this.faceUp.push(c); }
      if (!silent) this.say('Three locomotives were showing, so the face-up cards were replaced.');
    }
  }
  dealTickets(p, minKeep) {
    const n = Math.min(3, this.tickDeck.length);
    p.pending = this.tickDeck.splice(0, n);
    p.minKeep = Math.min(minKeep, n);
  }
  canDrawSecond() { return this.deck.length + this.discard.length > 0 || this.faceUp.some(c => c !== 'L'); }

  act(pi, a) {
    const p = this.players[pi];
    if (!p || !a || typeof a !== 'object') return bad('Invalid action.');
    if (this.phase === 'ended') return bad('The game is over.');
    if (a.type === 'keepTickets') return this.keep(pi, a.keep);
    if (this.phase !== 'play') return bad('Waiting for everyone to choose their tickets.');
    if (pi !== this.turn) return bad("It's not your turn.");
    if (p.pending) return bad('Choose which tickets to keep first.');
    switch (a.type) {
      case 'drawFaceUp': return this.drawFaceUp(pi, a.index | 0);
      case 'drawDeck': return this.drawDeck(pi);
      case 'drawTickets': return this.drawTickets(pi);
      case 'claim': return this.claim(pi, a);
      case 'pass':
        if (this.deck.length + this.discard.length || this.faceUp.length || this.tickDeck.length) return bad('You still have a legal move.');
        this.say(`${p.name} passed.`); this.endTurn(); return OK;
    }
    return bad('Unknown action.');
  }

  keep(pi, ids) {
    const p = this.players[pi];
    if (!p.pending) return bad('You have no tickets to choose from.');
    if (!Array.isArray(ids)) return bad('Invalid choice.');
    const keep = [...new Set(ids.map(Number))];
    if (!keep.every(id => p.pending.includes(id))) return bad('Invalid ticket.');
    if (keep.length < p.minKeep) return bad(`Keep at least ${p.minKeep} ticket${p.minKeep > 1 ? 's' : ''}.`);
    p.tickets.push(...keep);
    p.pending.filter(id => !keep.includes(id)).forEach(id => this.tickDeck.push(id));
    p.pending = null;
    if (this.phase === 'setup') {
      p.ready = true;
      this.say(`${p.name} is ready.`);
      if (this.players.every(q => q.ready)) {
        this.phase = 'play'; this.turn = Math.floor(Math.random() * this.players.length);
        this.say(`The game begins. ${this.players[this.turn].name} goes first.`);
      }
    } else {
      this.say(`${p.name} kept ${keep.length} new ticket${keep.length > 1 ? 's' : ''}.`);
      this.endTurn();
    }
    return OK;
  }

  drawFaceUp(pi, i) {
    const p = this.players[pi]; const c = this.faceUp[i];
    if (!c) return bad('There is no card there.');
    if (this.drew === 1 && c === 'L') return bad("You can't take a face-up locomotive as your second card.");
    p.hand[c]++;
    this.refill(i); this.checkLocos();
    if (c === 'L') { this.say(`${p.name} took a face-up locomotive.`); this.endTurn(); }
    else {
      this.say(`${p.name} took a face-up ${T.COLORS[c].toLowerCase()} card.`);
      if (++this.drew >= 2 || !this.canDrawSecond()) this.endTurn();
    }
    return OK;
  }
  drawDeck(pi) {
    const p = this.players[pi]; const c = this.draw();
    if (!c) return bad('The deck is empty.');
    p.hand[c]++;
    this.say(`${p.name} drew a card from the deck.`);
    if (++this.drew >= 2 || !this.canDrawSecond()) this.endTurn();
    return OK;
  }
  drawTickets(pi) {
    const p = this.players[pi];
    if (this.drew) return bad('You already drew a card this turn.');
    if (!this.tickDeck.length) return bad('No destination tickets left.');
    this.dealTickets(p, 1);
    this.say(`${p.name} is looking at new destination tickets.`);
    return OK;
  }
  claim(pi, a) {
    const p = this.players[pi]; const r = ROUTES[a.route | 0];
    if (!r) return bad('Unknown route.');
    if (this.drew) return bad('Finish drawing your second card first.');
    const e = T.canClaim(r, this.claims, this.players.length, pi, p.trains);
    if (e) return bad(e);
    const locos = a.locos | 0, colored = r.len - locos;
    if (locos < 0 || colored < 0 || locos > p.hand.L) return bad('Invalid payment.');
    const c = r.color === 'x' ? a.color : r.color;
    if (colored > 0) {
      if (!COL.includes(c)) return bad('Pick a colour to pay with.');
      if (p.hand[c] < colored) return bad(`You need ${colored} ${T.COLORS[c].toLowerCase()} card${colored > 1 ? 's' : ''}.`);
      p.hand[c] -= colored; for (let i = 0; i < colored; i++) this.discard.push(c);
    }
    p.hand.L -= locos; for (let i = 0; i < locos; i++) this.discard.push('L');
    this.claims[r.id] = pi; p.trains -= r.len; p.score += POINTS[r.len];
    this.say(`${p.name} claimed ${cname(r.a, r.b)} (+${POINTS[r.len]}).`);
    this.endTurn();
    return OK;
  }

  endTurn() {
    this.drew = 0;
    const cur = this.players[this.turn];
    if (this.final === null && cur.trains <= 2) {
      this.final = this.players.length;
      this.say(`${cur.name} is down to ${cur.trains} train${cur.trains === 1 ? '' : 's'}. Everyone gets one last turn!`);
    } else if (this.final !== null) this.final--;
    if (this.final === 0) return this.finish();
    this.turn = (this.turn + 1) % this.players.length;
  }

  longest(pi) {
    const adj = {};
    ROUTES.filter(r => this.claims[r.id] === pi).forEach(e => { (adj[e.a] = adj[e.a] || []).push(e); (adj[e.b] = adj[e.b] || []).push(e); });
    const used = new Set(); let best = 0;
    const dfs = (c, len) => {
      if (len > best) best = len;
      for (const e of adj[c] || []) {
        if (used.has(e.id)) continue;
        used.add(e.id); dfs(e.a === c ? e.b : e.a, len + e.len); used.delete(e.id);
      }
    };
    Object.keys(adj).forEach(c => dfs(c, 0));
    return best;
  }
  connected(pi, a, b) {
    const seen = new Set([a]); const stack = [a];
    while (stack.length) {
      const c = stack.pop();
      ROUTES.forEach(r => {
        if (this.claims[r.id] !== pi || (r.a !== c && r.b !== c)) return;
        const o = r.a === c ? r.b : r.a;
        if (!seen.has(o)) { seen.add(o); stack.push(o); }
      });
    }
    return seen.has(b);
  }
  finish() {
    this.phase = 'ended';
    const lens = this.players.map((_, i) => this.longest(i));
    const top = Math.max(...lens);
    const players = this.players.map((p, i) => {
      const routePts = ROUTES.filter(r => this.claims[r.id] === i).reduce((s, r) => s + POINTS[r.len], 0);
      const tickets = p.tickets.map(id => { const [a, b, pts] = TICKETS[id]; return { a, b, pts, done: this.connected(i, a, b) }; });
      const ticketPts = tickets.reduce((s, t) => s + (t.done ? t.pts : -t.pts), 0);
      const bonus = lens[i] === top && top > 0 ? 10 : 0;
      return { name: p.name, color: p.color, routePts, tickets, ticketPts, longest: lens[i], bonus, total: routePts + ticketPts + bonus };
    });
    const best = Math.max(...players.map(p => p.total));
    this.result = { players, winners: players.map((p, i) => (p.total === best ? i : -1)).filter(i => i >= 0) };
    this.say('The game is over!');
  }

  // What a given seat is allowed to see
  view(pi) {
    const p = this.players[pi];
    return {
      phase: this.phase, turn: this.turn, drew: this.drew, you: pi, final: this.final,
      players: this.players.map(q => ({
        name: q.name, color: q.color, bot: !!q.bot, trains: q.trains, score: q.score, ready: q.ready,
        cards: Object.values(q.hand).reduce((s, n) => s + n, 0), tickets: q.tickets.length, choosing: !!q.pending
      })),
      hand: p.hand, tickets: p.tickets, pending: p.pending, minKeep: p.minKeep,
      faceUp: this.faceUp, deckCount: this.deck.length + this.discard.length, ticketCount: this.tickDeck.length,
      claims: this.claims, log: this.log.slice(-40), result: this.result
    };
  }
}

module.exports = { Game };
