'use strict';
const assert = require('assert');
const { Game } = require('../game');
const { botMove } = require('../bot');
const T = require('../shared/mapdata');

const lanes = T.ROUTES.length;
console.log(`cities=${Object.keys(T.CITIES).length} lanes=${lanes} tickets=${T.TICKETS.length}`);
assert.strictEqual(Object.keys(T.CITIES).length, 36);
assert.strictEqual(T.TICKETS.length, 30);
T.ROUTES.forEach(r => { assert(T.CITIES[r.a] && T.CITIES[r.b], 'bad city in route ' + r.id); });

for (let n = 2; n <= 5; n++) {
  for (let round = 0; round < 5; round++) {
    const g = new Game(Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, color: T.PNAMES[i], bot: true })));
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 30000) {
      if (g.phase === 'setup') g.players.forEach((p, i) => p.pending && botMove(g, i));
      else botMove(g, g.turn);
      const cards = g.deck.length + g.discard.length + g.faceUp.length +
        g.players.reduce((s, p) => s + Object.values(p.hand).reduce((a, b) => a + b, 0), 0);
      assert.strictEqual(cards, 110, 'card conservation');
    }
    assert.strictEqual(g.phase, 'ended', `game with ${n} players did not finish`);
    if (round === 0) console.log(`${n} players: finished in ${steps} actions, totals`, g.result.players.map(p => p.total));
  }
}
console.log('OK');
