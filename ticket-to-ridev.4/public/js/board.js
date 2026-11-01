import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const T = window.TTR;
const W = 1000, H = 640;
const HEX = { r: 0xc23b32, o: 0xe8832a, y: 0xf2c92e, g: 0x2f9e5b, b: 0x2f7fd0, p: 0xe06aa8, w: 0xf4f1e8, k: 0x2b2f33, x: 0xb9b19b };
const wx = x => x - W / 2, wz = y => y - H / 2;

const LAND = [[0,0],[1000,0],[1000,90],[985,150],[968,200],[952,232],[948,262],[928,292],[915,338],[905,382],[890,420],[884,470],[866,505],[850,525],[858,572],[862,622],[838,640],[815,612],[800,548],[772,524],[742,532],[704,548],[668,572],[672,592],[640,596],[604,592],[575,612],[552,602],[512,628],[478,640],[440,640],[405,600],[330,556],[280,546],[230,516],[150,510],[96,500],[70,470],[52,420],[35,350],[30,300],[24,250],[26,180],[30,120],[0,60]];
const MEXICO = [[96,500],[150,510],[230,516],[280,546],[330,556],[405,600],[440,640],[130,640],[110,570]];
const LAKES = [[605,130,72,28,0.12],[672,238,13,48,0.1],[730,178,36,24,-0.5],[792,258,42,10,0.25],[838,228,32,11,-0.1]];

function mapTexture() {
  const c = document.createElement('canvas'); c.width = 2000; c.height = 1280;
  const g = c.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#7fa3a2'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 1;
  for (let y = 8; y < H; y += 13) { g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.045 + y) * 2); g.stroke(); }
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#6f5f3c'; g.lineWidth = 2; g.stroke(); };
  poly(MEXICO, '#cbb98c'); poly(LAND, '#e4d6ab');
  LAKES.forEach(([x, y, rx, ry, r]) => { g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 7); g.fillStyle = '#7fa3a2'; g.fill(); g.strokeStyle = '#6f5f3c'; g.lineWidth = 1.5; g.stroke(); });
  g.setLineDash([5, 5]); g.strokeStyle = 'rgba(95,75,40,.45)'; g.lineWidth = 1.5;
  [[[28,92],[300,92],[430,105],[520,140]], [[760,150],[860,150],[930,125],[990,108]]].forEach(l => { g.beginPath(); l.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); });
  g.setLineDash([]);
  for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(90,60,20,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, Math.random() * 3, Math.random() * 3); }
  g.fillStyle = 'rgba(75,60,32,.55)'; g.textAlign = 'center'; g.font = 'italic 700 26px Georgia,serif';
  const txt = (s, x, y, rot = 0, size = 26) => { g.save(); g.translate(x, y); g.rotate(rot); g.font = `italic 700 ${size}px Georgia,serif`; g.fillText(s.split('').join(' '), 0, 0); g.restore(); };
  txt('CANADA', 330, 26); txt('UNITED STATES', 380, 250, 0, 20); txt('MEXICO', 190, 608); txt('GULF OF MEXICO', 700, 630, 0, 14);
  g.fillStyle = 'rgba(240,248,248,.7)'; txt('PACIFIC', 12, 400, -Math.PI / 2, 18); txt('ATLANTIC', 975, 560, Math.PI / 2, 18);
  return new THREE.CanvasTexture(c);
}

function label(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 44px "Alfa Slab One",Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 11; g.strokeStyle = 'rgba(25,18,6,.92)'; g.strokeText(text, 256, 48);
  g.fillStyle = '#fff6dc'; g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(92, 17.3, 1); s.renderOrder = 10; return s;
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const bounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };

export function createBoard(el, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10201c);
  const cam = new THREE.PerspectiveCamera(42, 1, 10, 5000);
  cam.position.set(0, 800, 640);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.enableDamping = true; ctl.maxPolarAngle = 1.15; ctl.minDistance = 220; ctl.maxDistance = 1500; ctl.screenSpacePanning = false;
  ctl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  ctl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x2a3a34, 0.85));
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.1);
  sun.position.set(-300, 700, 400); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 400, bottom: -400, near: 100, far: 1800 });
  scene.add(sun);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3000), new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: 1 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -4; table.receiveShadow = true; scene.add(table);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 36, 8, H + 36), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 }));
  frame.position.y = -0.5; frame.receiveShadow = true; scene.add(frame);
  const map = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: mapTexture(), roughness: 0.95 }));
  map.rotation.x = -Math.PI / 2; map.position.y = 3.6; map.receiveShadow = true; scene.add(map);

  // cities
  const cityPos = {};
  Object.entries(T.CITIES).forEach(([k, [name, x, y]]) => {
    cityPos[k] = new THREE.Vector3(wx(x), 0, wz(y));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 3, 24), new THREE.MeshStandardMaterial({ color: 0xb9382c, roughness: 0.5 }));
    m.position.set(wx(x), 5, wz(y)); m.castShadow = true; scene.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.4, 8, 28), new THREE.MeshStandardMaterial({ color: 0xf1e6c3 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(wx(x), 6.4, wz(y)); scene.add(ring);
    const l = label(name); l.position.set(wx(x), 18, wz(y) + 17); scene.add(l);
  });

  // route slots
  const slotMeshes = [], routeMats = {}, routeSlots = {}, built = new Set(), cars = {};
  T.ROUTES.forEach(r => {
    const A = cityPos[r.a], B = cityPos[r.b];
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const off = r.lanes > 1 ? (r.lane ? -6.2 : 6.2) : 0;
    const margin = 13, gap = 2.6, slotLen = (L - 2 * margin - (r.len - 1) * gap) / r.len;
    const mat = new THREE.MeshStandardMaterial({ color: HEX[r.color], roughness: 0.65, emissive: 0xffe08a, emissiveIntensity: 0 });
    routeMats[r.id] = mat; routeSlots[r.id] = [];
    for (let i = 0; i < r.len; i++) {
      const d = margin + slotLen / 2 + i * (slotLen + gap);
      const pos = new THREE.Vector3(A.x + ux * d + nx * off, 4.6, A.z + uz * d + nz * off);
      const rotY = -Math.atan2(dz, dx);
      const m = new THREE.Mesh(new THREE.BoxGeometry(slotLen, 1.6, 7.6), mat);
      m.position.copy(pos); m.rotation.y = rotY; m.receiveShadow = true; m.userData = { route: r.id, len: slotLen, rotY };
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x2a2113 }));
      m.add(edge); scene.add(m); slotMeshes.push(m); routeSlots[r.id].push(m);
    }
  });

  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1b18, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0x6b5a2a, roughness: 0.3 });
  const BED = 0x3a3225; // claimed track bed: dark, so the owner's colour is the only bright thing on the route
  const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  function makeCar(len, color) {
    const outer = new THREE.Group(), g = new THREE.Group(); outer.add(g);
    const light = lum(color) > 0.4; // yellow and white read as 'light'
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: light ? 0.1 : 0.28 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(len * 0.94, 6, 7.4), mat);
    body.position.y = 4.2; body.castShadow = true; g.add(body);
    const edges = new THREE.EdgesGeometry(body.geometry);
    body.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }))); // same bright outline for every colour
    if (light) { const halo = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x14100a })); halo.scale.set(1.035, 1.06, 1.12); body.add(halo); } // dark halo keeps it visible on yellow
    const win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.66, 2, 7.8), glass); win.position.y = 5.4; g.add(win);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 1.4, 6.6), dark); roof.position.y = 7.9; roof.castShadow = true; g.add(roof);
    [-0.28, 0.28].forEach(k => [-3.7, 3.7].forEach(s => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(len * k, 1.4, s); g.add(w);
    }));
    return { outer, inner: g };
  }
  const anims = [];
  function buildCars(id, color, animate) {
    cars[id] = []; routeMats[id].color.setHex(BED);
    routeSlots[id].forEach((s, i) => {
      // owner-coloured base plate shows at once; the car then drops onto it
      const plate = new THREE.Mesh(new THREE.BoxGeometry(s.userData.len + 2.6, 0.9, 11), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.2 }));
      plate.position.set(s.position.x, 5.45, s.position.z); plate.rotation.y = s.userData.rotY; plate.receiveShadow = true;
      const pe = new THREE.EdgesGeometry(plate.geometry);
      plate.add(new THREE.LineSegments(pe, new THREE.LineBasicMaterial({ color: 0xfff6dc })));
      if (lum(color) > 0.4) { const halo = new THREE.LineSegments(pe, new THREE.LineBasicMaterial({ color: 0x14100a })); halo.scale.set(1.03, 1.2, 1.1); plate.add(halo); }
      scene.add(plate); cars[id].push(plate);
      const c = makeCar(s.userData.len, color);
      c.outer.position.set(s.position.x, 5.9, s.position.z); c.outer.rotation.y = s.userData.rotY;
      scene.add(c.outer); cars[id].push(c.outer);
      if (animate) { c.inner.position.y = 90; c.outer.visible = false; anims.push({ g: c.inner, o: c.outer, t: -i * 0.12, dur: 0.7 }); }
    });
  }

  // toy locomotive + steam
  const puffTex = puffTexture(); const puffs = []; const trains = [];
  function runTrain(id, color) {
    const r = T.ROUTES[id], A = cityPos[r.a], B = cityPos[r.b];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 9), mat); body.position.y = 9; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 10), dark); cab.position.set(-8, 15, 0); g.add(cab);
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 15, 14), mat); boiler.rotation.z = Math.PI / 2; boiler.position.set(5, 14, 0); g.add(boiler);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 6, 10), dark); chim.position.set(9, 21, 0); g.add(chim);
    [-8, 0, 8].forEach(x => [-5, 5].forEach(z => { const w = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.2, 14), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 4, z); g.add(w); }));
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    scene.add(g); trains.push({ g, A, B, t: 0, dur: 1 + r.len * 0.45, spawn: 0 });
  }

  // ticket highlight (hover on a ticket in the tray)
  const beacon = new THREE.Group(); scene.add(beacon);
  function showTickets(items) {
    clearTicket();
    items.forEach(({ a, b, color }) => {
      const col = new THREE.Color(color || '#ffd77a');
      [a, b].forEach(k => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(16, 21, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(cityPos[k].x, 8, cityPos[k].z); ring.renderOrder = 5; beacon.add(ring);
      });
      const A = cityPos[a], B = cityPos[b], L = A.distanceTo(B);
      const line = new THREE.Mesh(new THREE.BoxGeometry(L, 0.8, 2.4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthTest: false }));
      line.position.set((A.x + B.x) / 2, 9, (A.z + B.z) / 2); line.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x); line.renderOrder = 5; beacon.add(line);
    });
  }
  const showTicket = (a, b, color) => showTickets([{ a, b, color }]);
  function clearTicket() { while (beacon.children.length) beacon.remove(beacon.children[0]); }

  // picking
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let hover = null, claimable = new Set(), down = null;
  const dom = renderer.domElement;
  const pick = (e) => {
    const rect = dom.getBoundingClientRect();
    mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObjects(slotMeshes, false)[0];
    return hit ? hit.object.userData.route : null;
  };
  dom.addEventListener('pointermove', (e) => { if (e.buttons) return; hover = pick(e); dom.style.cursor = hover !== null ? 'pointer' : 'grab'; cb.hover(hover, e.clientX, e.clientY); });
  dom.addEventListener('pointerleave', () => { hover = null; cb.hover(null); });
  dom.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  dom.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) { const id = pick(e); if (id !== null) cb.click(id); }
    down = null;
  });

  function resize() {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    renderer.setSize(w, h); cam.aspect = w / h;
    cam.position.y = Math.max(cam.position.y, 0); cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el); resize();
  { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; const D = Math.max(700, 1354 / Math.max(0.5, w / h)); cam.position.set(0, D * 0.783, D * 0.622); } // fits the board in its frame

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    ctl.target.x = THREE.MathUtils.clamp(ctl.target.x, -W / 2, W / 2); ctl.target.z = THREE.MathUtils.clamp(ctl.target.z, -H / 2, H / 2);
    ctl.update();
    Object.entries(routeMats).forEach(([id, m]) => { m.emissiveIntensity = +id === hover ? 0.7 : claimable.has(+id) ? 0.22 + 0.2 * Math.sin(t * 4) : 0; });
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]; a.t += dt; if (a.t < 0) continue;
      a.o.visible = true; const k = Math.min(1, a.t / a.dur); a.g.position.y = 90 * (1 - bounce(k));
      if (k >= 1) { a.g.position.y = 0; anims.splice(i, 1); }
    }
    for (let i = trains.length - 1; i >= 0; i--) {
      const tr = trains[i]; tr.t += dt; const k = Math.min(1, tr.t / tr.dur);
      tr.g.position.lerpVectors(tr.A, tr.B, k); tr.g.position.y = 4.8;
      tr.spawn -= dt;
      if (tr.spawn <= 0) {
        tr.spawn = 0.09;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.85, depthWrite: false }));
        const ang = tr.g.rotation.y; s.position.set(tr.g.position.x + Math.cos(ang) * 9, 27, tr.g.position.z - Math.sin(ang) * 9); s.scale.set(7, 7, 1);
        scene.add(s); puffs.push({ s, life: 0 });
      }
      if (k >= 1) { scene.remove(tr.g); trains.splice(i, 1); }
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life += dt; p.s.position.y += 22 * dt; p.s.position.x += 6 * dt;
      const k = p.life / 1.1; p.s.scale.setScalar(7 + 18 * k); p.s.material.opacity = 0.85 * (1 - k);
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
    }
    beacon.children.forEach(c => { c.material.opacity = 0.45 + 0.4 * Math.sin(t * 6); });
    renderer.render(scene, cam);
  })();

  let synced = false;
  return {
    update(st) {
      const fresh = [];
      for (const k in st.claims) {
        const id = +k; if (built.has(id)) continue;
        built.add(id);
        const color = new THREE.Color(T.PCOL[st.players[st.claims[k]].color]);
        buildCars(id, color, synced);
        if (synced) fresh.push({ id, pi: st.claims[k] });
      }
      fresh.forEach((f, i) => setTimeout(() => runTrain(f.id, new THREE.Color(T.PCOL[st.players[f.pi].color])), 250 + i * 400));
      synced = true;
      return fresh;
    },
    reset() {
      Object.values(cars).flat().forEach(c => scene.remove(c));
      for (const k in cars) { routeMats[k].color.setHex(HEX[T.ROUTES[k].color]); delete cars[k]; }
      built.clear(); anims.length = 0; synced = false;
    },
    setClaimable(ids) { claimable = new Set(ids); },
    showTicket, showTickets, clearTicket
  };
}
