/* Shared map data + pure rule helpers. Loaded by Node (require) and by the browser (<script>). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COL = ['r', 'o', 'y', 'g', 'b', 'p', 'w', 'k'];
  const COLORS = { r: 'Red', o: 'Orange', y: 'Yellow', g: 'Green', b: 'Blue', p: 'Pink', w: 'White', k: 'Black', x: 'Gray', L: 'Locomotive' };
  const PCOL = { red: '#d63031', blue: '#0984e3', green: '#00a86b', yellow: '#f1c40f', black: '#2d3436' };
  const PNAMES = Object.keys(PCOL);

  // key: [name, x, y] on a 1000 x 640 board
  const CITIES = {
    van: ['Vancouver', 70, 60], sea: ['Seattle', 80, 110], por: ['Portland', 60, 165],
    sf: ['San Francisco', 45, 330], la: ['Los Angeles', 110, 455], lv: ['Las Vegas', 170, 385],
    slc: ['Salt Lake City', 240, 310], phx: ['Phoenix', 230, 470], den: ['Denver', 370, 350],
    sfe: ['Santa Fe', 350, 450], elp: ['El Paso', 330, 540], cal: ['Calgary', 190, 50],
    hel: ['Helena', 275, 185], win: ['Winnipeg', 445, 60], dul: ['Duluth', 545, 150],
    oma: ['Omaha', 500, 300], kc: ['Kansas City', 540, 365], okc: ['Oklahoma City', 510, 440],
    dal: ['Dallas', 520, 520], hou: ['Houston', 560, 570], nol: ['New Orleans', 630, 570],
    lr: ['Little Rock', 600, 470], stl: ['Saint Louis', 610, 370], chi: ['Chicago', 650, 290],
    ssm: ['Sault St. Marie', 665, 130], tor: ['Toronto', 780, 220], pit: ['Pittsburgh', 800, 300],
    nas: ['Nashville', 700, 430], atl: ['Atlanta', 740, 480], cha: ['Charleston', 860, 470],
    ral: ['Raleigh', 820, 410], was: ['Washington', 880, 340], ny: ['New York', 900, 260],
    bos: ['Boston', 940, 190], mon: ['Montreal', 870, 120], mia: ['Miami', 830, 600]
  };

  // [from, to, length, lane colours]  (one letter per lane, x = gray)
  const R = [
    ['van', 'cal', 3, 'x'], ['van', 'sea', 1, 'xx'], ['sea', 'cal', 4, 'x'], ['sea', 'hel', 6, 'y'], ['sea', 'por', 1, 'xx'],
    ['por', 'sf', 5, 'gp'], ['por', 'slc', 6, 'b'], ['sf', 'slc', 5, 'ow'], ['sf', 'la', 3, 'yp'], ['la', 'lv', 2, 'x'],
    ['la', 'phx', 3, 'x'], ['la', 'elp', 6, 'k'], ['lv', 'slc', 3, 'o'], ['slc', 'hel', 3, 'p'], ['slc', 'den', 3, 'ry'],
    ['phx', 'den', 5, 'w'], ['phx', 'sfe', 3, 'x'], ['phx', 'elp', 3, 'x'], ['cal', 'hel', 4, 'x'], ['cal', 'win', 6, 'w'],
    ['hel', 'win', 4, 'b'], ['hel', 'dul', 6, 'o'], ['hel', 'oma', 5, 'r'], ['hel', 'den', 4, 'g'], ['den', 'oma', 4, 'p'],
    ['den', 'kc', 4, 'ko'], ['den', 'okc', 4, 'r'], ['den', 'sfe', 2, 'x'], ['sfe', 'okc', 3, 'b'], ['sfe', 'elp', 2, 'x'],
    ['elp', 'okc', 5, 'y'], ['elp', 'dal', 4, 'r'], ['elp', 'hou', 6, 'g'], ['win', 'ssm', 6, 'x'], ['win', 'dul', 4, 'k'],
    ['dul', 'ssm', 3, 'x'], ['dul', 'tor', 6, 'p'], ['dul', 'chi', 3, 'r'], ['dul', 'oma', 2, 'xx'], ['oma', 'chi', 4, 'b'],
    ['oma', 'kc', 1, 'xx'], ['kc', 'stl', 2, 'bp'], ['kc', 'okc', 2, 'xx'], ['okc', 'lr', 2, 'x'], ['okc', 'dal', 2, 'xx'],
    ['dal', 'lr', 2, 'x'], ['dal', 'hou', 1, 'xx'], ['hou', 'nol', 2, 'x'], ['lr', 'nol', 3, 'g'], ['lr', 'stl', 2, 'x'],
    ['lr', 'nas', 3, 'w'], ['nol', 'atl', 4, 'yo'], ['nol', 'mia', 6, 'r'], ['stl', 'chi', 2, 'gw'], ['stl', 'pit', 5, 'g'],
    ['stl', 'nas', 2, 'x'], ['chi', 'tor', 4, 'w'], ['chi', 'pit', 3, 'ok'], ['ssm', 'tor', 2, 'x'], ['ssm', 'mon', 5, 'k'],
    ['tor', 'mon', 3, 'x'], ['tor', 'pit', 2, 'x'], ['mon', 'bos', 2, 'xx'], ['mon', 'ny', 3, 'b'], ['bos', 'ny', 2, 'yr'],
    ['ny', 'pit', 2, 'wg'], ['ny', 'was', 2, 'ok'], ['pit', 'was', 2, 'x'], ['pit', 'ral', 2, 'x'], ['pit', 'nas', 4, 'y'],
    ['was', 'ral', 2, 'xx'], ['ral', 'nas', 3, 'k'], ['ral', 'atl', 2, 'xx'], ['ral', 'cha', 2, 'x'], ['nas', 'atl', 1, 'x'],
    ['atl', 'cha', 2, 'x'], ['atl', 'mia', 5, 'b'], ['cha', 'mia', 4, 'p']
  ];
  const ROUTES = [];
  R.forEach(([a, b, len, cols]) => {
    const base = ROUTES.length;
    [...cols].forEach((c, i) => ROUTES.push({ id: base + i, a, b, len, color: c, lane: i, lanes: cols.length, twin: cols.length > 1 ? base + (1 - i) : -1 }));
  });

  // [from, to, points]
  const TICKETS = [
    ['la', 'ny', 21], ['dul', 'hou', 8], ['ssm', 'nas', 8], ['ny', 'atl', 6], ['por', 'nas', 17], ['van', 'mon', 20],
    ['dul', 'elp', 10], ['tor', 'mia', 10], ['por', 'phx', 11], ['dal', 'ny', 11], ['cal', 'slc', 7], ['cal', 'phx', 13],
    ['la', 'mia', 20], ['win', 'lr', 11], ['sf', 'atl', 17], ['kc', 'hou', 5], ['la', 'chi', 16], ['den', 'pit', 11],
    ['chi', 'sfe', 9], ['van', 'sfe', 13], ['bos', 'mia', 12], ['chi', 'nol', 7], ['mon', 'atl', 9], ['sea', 'ny', 22],
    ['den', 'elp', 4], ['hel', 'la', 8], ['win', 'hou', 12], ['mon', 'nol', 13], ['ssm', 'okc', 9], ['sea', 'la', 9]
  ];
  const POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

  // Why a route can't be claimed right now (null = ok). claims: {routeId: playerIndex}
  function canClaim(r, claims, nPlayers, pi, trains) {
    if (claims[r.id] !== undefined) return 'That route is already claimed.';
    if (trains < r.len) return 'Not enough trains left for that route.';
    if (r.twin >= 0) {
      const o = claims[r.twin];
      if (o === pi) return 'You already own the parallel route.';
      if (o !== undefined && nPlayers <= 3) return 'With 2-3 players only one of the parallel routes can be used.';
    }
    return null;
  }
  // Ways the hand can pay for the route: [{color, min, max}] where min/max = locomotives used
  function payOptions(r, hand) {
    const out = [];
    const cols = r.color === 'x' ? COL : [r.color];
    cols.forEach(c => {
      if (r.color === 'x' && !hand[c]) return;
      const min = Math.max(0, r.len - hand[c]);
      if (min <= hand.L) out.push({ color: c, min, max: Math.min(hand.L, r.len) });
    });
    if (r.color === 'x' && hand.L >= r.len) out.push({ color: 'L', min: r.len, max: r.len });
    return out.sort((a, b) => a.min - b.min);
  }

  return { COL, COLORS, PCOL, PNAMES, CITIES, ROUTES, TICKETS, POINTS, canClaim, payOptions };
});
