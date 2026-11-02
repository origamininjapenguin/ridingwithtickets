'use strict';
// Simple heuristic bot: plans cheapest paths for its tickets, claims what it can, otherwise draws toward them.
const T = require('./shared/mapdata.js');
const { COL, ROUTES, TICKETS } = T;

function edgeCost(g, pi, r) {
  const owner = g.claims[r.id];
  if (owner === pi) return 0;
  if (owner !== undefined) return Infinity;
  if (r.twin >= 0) {
    const o = g.claims[r.twin];
    if (o === pi) return Infinity;
    if (o !== undefined && g.players.length <= 3) return Infinity;
  }
  return r.len;
}

// Cheapest path a -> b over routes still usable by this player. Returns {cost, routes:[unclaimed routes needed]} or null.
function path(g, pi, a, b) {
  const dist = { [a]: 0 }, prev = {}, done = new Set();
  for (;;) {
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) return null;
    if (u === b) break;
    done.add(u);
    for (const r of ROUTES) {
      if (r.a !== u && r.b !== u) continue;
      const c = edgeCost(g, pi, r);
      if (c === Infinity) continue;
      const v = r.a === u ? r.b : r.a;
      if (dist[v] === undefined || dist[u] + c < dist[v]) { dist[v] = dist[u] + c; prev[v] = r; }
    }
  }
  const routes = []; let c = b;
  while (c !== a) { const r = prev[c]; if (g.claims[r.id] !== pi) routes.push(r); c = r.a === c ? r.b : r.a; }
  return { cost: dist[b], routes };
}

function targets(g, pi) {
  const list = [];
  g.players[pi].tickets.forEach(id => {
    const [a, b, pts] = TICKETS[id];
    const p = path(g, pi, a, b);
    if (p && p.routes.length) p.routes.forEach(r => list.push({ r, w: pts / Math.max(1, p.cost) }));
  });
  const seen = new Set();
  return list.sort((x, y) => y.w - x.w).map(x => x.r).filter(r => !seen.has(r.id) && seen.add(r.id));
}

function tryClaim(g, pi, r) {
  const p = g.players[pi];
  if (T.canClaim(r, g.claims, g.players.length, pi, p.trains)) return false;
  const opt = T.payOptions(r, p.hand)[0];
  if (!opt) return false;
  return g.act(pi, { type: 'claim', route: r.id, color: opt.color, locos: opt.min }).ok;
}

function keepTickets(g, pi) {
  const p = g.players[pi];
  const sc = p.pending.map(id => {
    const [a, b, pts] = TICKETS[id]; const pa = path(g, pi, a, b);
    return { id, v: pa ? pts / Math.max(1, pa.cost) : 0 };
  }).sort((x, y) => y.v - x.v);
  const keep = sc.slice(0, Math.max(1, p.minKeep)).map(s => s.id);
  if (sc[keep.length] && sc[keep.length].v > 0.9 && keep.length < 3) keep.push(sc[keep.length].id);
  return g.act(pi, { type: 'keepTickets', keep }).ok;
}

// Takes exactly one action for seat pi.
function botMove(g, pi) {
  const p = g.players[pi];
  if (p.pending) return keepTickets(g, pi);
  const t = targets(g, pi);
  if (!g.drew) for (const r of t) if (tryClaim(g, pi, r)) return true;
  if (!g.drew && !t.length) {
    if (p.trains > 12 && g.tickDeck.length > 2 && Math.random() < 0.6 && g.act(pi, { type: 'drawTickets' }).ok) return true;
    const any = ROUTES.filter(r => !T.canClaim(r, g.claims, g.players.length, pi, p.trains)).sort((a, b) => b.len - a.len);
    for (const r of any) if (tryClaim(g, pi, r)) return true;
  }
  // draw toward target colours
  const want = new Set();
  t.slice(0, 4).forEach(r => {
    if (r.color !== 'x') want.add(r.color);
    else want.add(COL.slice().sort((a, b) => p.hand[b] - p.hand[a])[0]);
  });
  if (!want.size) COL.forEach(c => want.add(c));
  if (!g.drew && g.faceUp.includes('L') && p.hand.L < 3 && g.act(pi, { type: 'drawFaceUp', index: g.faceUp.indexOf('L') }).ok) return true;
  const i = g.faceUp.findIndex(c => want.has(c));
  if (i >= 0 && g.act(pi, { type: 'drawFaceUp', index: i }).ok) return true;
  if (g.act(pi, { type: 'drawDeck' }).ok) return true;
  const j = g.faceUp.findIndex(c => c !== 'L');
  if (j >= 0 && g.act(pi, { type: 'drawFaceUp', index: j }).ok) return true;
  if (!g.drew && g.act(pi, { type: 'drawTickets' }).ok) return true;
  return g.act(pi, { type: 'pass' }).ok;
}

module.exports = { botMove };
