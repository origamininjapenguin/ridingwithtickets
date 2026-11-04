'use strict';
// The last-round rule: when a player has 2 or fewer trains at the end of their turn,
// every player, including that player, gets exactly one more turn.
const assert = require('assert');
const { Game } = require('../game');
const T = require('../shared/mapdata');

const seats = (n) => Array.from({ length: n }, (_, i) => ({ id: 't' + i, name: 'P' + i, color: T.PNAMES[i], bot: false }));
function fresh(n, start) {
  const g = new Game(seats(n));
  g.players.forEach(p => { p.pending = null; p.ready = true; });
  g.phase = 'play'; g.turn = start; g.turnNo = 1;
  return g;
}
const playTurn = (g) => { const who = g.turn; const t = g.turnNo; g.act(who, { type: 'drawDeck' }); g.act(who, { type: 'drawDeck' }); assert(g.turnNo !== t || g.phase === 'ended', 'turn did not advance'); };

let checked = 0;
for (let n = 2; n <= 5; n++) {
  for (let trig = 0; trig < n; trig++) {
    // trigger by drawing (trains already at 2 when the turn ends)
    const g = fresh(n, trig);
    g.players[trig].trains = 2;
    playTurn(g);
    assert.strictEqual(g.phase, 'play', 'game must not end on the triggering turn');
    const after = [];
    while (g.phase !== 'ended') { after.push(g.turn); playTurn(g); assert(after.length <= n, 'too many extra turns'); }
    const expected = Array.from({ length: n }, (_, k) => (trig + 1 + k) % n);
    assert.deepStrictEqual(after, expected, `n=${n} trigger=${trig}: turns after trigger ${after} should be ${expected}`);
    checked++;
  }
}
// trigger by claiming a route (3 -> 2 trains), 3 players
{
  const g = fresh(3, 1);
  const r = T.ROUTES.find(x => x.len === 1 && x.color === 'x');
  g.players[1].trains = 3; g.players[1].hand.r = 5;
  assert(g.act(1, { type: 'claim', route: r.id, color: 'r', locos: 0 }).ok);
  assert.strictEqual(g.players[1].trains, 2);
  const after = []; while (g.phase !== 'ended') { after.push(g.turn); playTurn(g); }
  assert.deepStrictEqual(after, [2, 0, 1]);
  assert(g.log.some(l => /final round/i.test(l)), 'final round announcement');
  checked++;
}
console.log(`last-round rule OK in ${checked} scenarios`);
