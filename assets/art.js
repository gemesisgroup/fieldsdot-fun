/* =========================================================
   FIELDS — pixel art + motion layer.
   Pure decoration and the "grow your bag" simulator.
   Reads the DOM that fields.js fills; never touches data.
   ========================================================= */
(() => {
  'use strict';
  document.documentElement.classList.remove('no-js');

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const C = {
    ink: '#122d25', forest: '#0c2c23', forest2: '#143b2e', forest3: '#1d4d3b',
    acid: '#d4fa77', acid2: '#b9e45a', grass: '#4ed09a', grass2: '#2a9c6c', grass3: '#1f7a52',
    orange: '#ff8b65', orange2: '#e5653f', gold: '#f6c945', gold2: '#d9a52b',
    paper: '#edf0e6', sky: '#a9dde4', sky2: '#cdeef0', cloud: '#f7fbf4',
    soil: '#6d4a2e', soil2: '#4f3320', soil3: '#87603d', hill: '#2f7d5a', hill2: '#3d9a6e',
    brown: '#7a5132', wilt: '#a38a4a',
  };

  /* ---------------- sprites ---------------- */
  const PAL = {
    k: C.ink, g: C.grass, G: C.grass3, a: C.acid, o: C.orange, O: C.orange2,
    y: C.gold, Y: C.gold2, b: C.soil3, B: C.soil2, w: C.paper, s: C.wilt,
  };
  const SPRITES = {
    sprout: [
      '............',
      '...aa.......',
      '..agga..aa..',
      '...gga.agga.',
      '....ggagg...',
      '......gG....',
      '......G.....',
      '......G.....',
      '....bbbbb...',
      '...bBBBBBb..',
      '..bBBBBBBBb.',
      '............',
    ],
    coins: [
      '............',
      '......yyyy..',
      '.....yaaaay.',
      '.....yyyyyy.',
      '.....YyyyyY.',
      '.yyyy.yyyy..',
      'yaaaay.YYY..',
      'yyyyyy......',
      'YyyyyY.yyyy.',
      'yyyyyyyaaaay',
      'YYYYYYyyyyyy',
      '......YYYYYY',
    ],
    pot: [
      '............',
      '....kkkk....',
      '.....aa.....',
      '....k..k....',
      '...gggggg...',
      '..gggggggg..',
      '..ggaaaagg..',
      '..ggagggGg..',
      '..ggaaaagg..',
      '..gggggaGg..',
      '...ggaaaa...',
      '............',
    ],
    wilt: [
      '............',
      '.....oo.....',
      '....oOOo....',
      '.....oo.s...',
      '.......s....',
      '......s.....',
      '.....ss.....',
      '......s.....',
      '......s.....',
      '....bbbbb...',
      '...bBBBBBb..',
      '............',
    ],
    seed: [
      '............',
      '............',
      '.....a......',
      '....aga.....',
      '.....g......',
      '.....g......',
      '....bbb.....',
      '...bBBBb....',
      '...bBBBb....',
      '..bbbbbbbb..',
      '.bBBBBBBBBb.',
      '............',
    ],
    mark: [
      '............',
      '..aaa..aaa..',
      '.aaaaa.aaaa.',
      '.aaaaaaaaa..',
      '...aaaaaa...',
      '.....aa.....',
      '.....aa.....',
      '.....aa.....',
      '.....aa.....',
      '..gggggggg..',
      '.gggggggggg.',
      '............',
    ],
  };
  function drawSprite(ctx, name, ox = 0, oy = 0) {
    const rows = SPRITES[name];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = PAL[row[x]];
        if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); }
      }
    });
  }
  function paintSpriteCanvas(cv, name) {
    cv.width = 12; cv.height = 12;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 12, 12);
    drawSprite(ctx, name);
  }

  /* ---------------- helpers ---------------- */
  const rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };
  // seeded random so the field is the same on every visit
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /* Animation loop registry: each scene runs only while on screen. */
  const scenes = [];
  function scene(el, draw) {
    const s = { el, draw, visible: true };
    scenes.push(s);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(el);
    }
    draw(0, 0); // first frame immediately, also for reduced motion
    return s;
  }
  let last = 0;
  function frame(t) {
    const dt = Math.min(64, t - (last || t));
    last = t;
    for (const s of scenes) if (s.visible && !document.hidden) s.draw(t / 1000, dt / 1000);
    requestAnimationFrame(frame);
  }

  /* ---------------- crop drawing (shared) ---------------- */
  // stage 0..5 (fractional allowed), sway in px at the top, wilt 0..1
  function drawCrop(ctx, x, ground, stage, sway = 0, wilt = 0, big = 1) {
    const st = clamp(stage, 0, 5);
    const h = Math.round((2 + st * 2.6) * big);
    const stem = wilt > 0 ? mix(C.grass3, C.wilt, wilt) : C.grass3;
    const leaf = wilt > 0 ? mix(C.grass, C.wilt, wilt) : C.grass;
    const leafHi = wilt > 0 ? mix(C.acid, C.wilt, wilt) : C.acid;
    // soil mound
    rect(ctx, x - 2, ground, 5, 1, C.soil2);
    if (st < 0.4) { rect(ctx, x, ground - 1, 1, 1, C.soil3); return; }
    let px = x;
    const sw = big >= 2 ? 2 : 1;
    for (let i = 0; i < h; i++) {
      const k = i / Math.max(1, h);
      const dx = Math.round(sway * k * k + wilt * k * k * 3);
      const yy = ground - 1 - i + Math.round(wilt * k * k * h * 0.35);
      rect(ctx, x + dx, yy, sw, 1, stem);
      px = x + dx;
      // leaves: every 3 px on small crops, every 5 px (and bigger) on large ones
      const every = sw === 2 ? 5 : 3;
      if (i > 0 && i % every === 1 && i < h - 2) {
        const side = Math.floor(i / every) % 2 ? 1 : -1;
        const lx = side < 0 ? x + dx - sw : x + dx + sw;
        rect(ctx, lx, yy, sw, 1, leaf);
        if (big > 1.2 || st > 2) rect(ctx, lx + side * sw, yy - 1, sw, 1, leaf);
        if (sw === 2) { rect(ctx, lx + side * sw * 2, yy - 2, sw, 1, leafHi); rect(ctx, lx + side * sw, yy, sw, 1, leaf); }
      }
    }
    const topY = ground - h + Math.round(wilt * h * 0.35);
    const tx = px;
    if (st >= 1 && st < 3.5 && sw === 1) {
      rect(ctx, tx - 1, topY - 1, 1, 1, leafHi);
      rect(ctx, tx + 1, topY - 1, 1, 1, leafHi);
    }
    if (st >= 3.5 && sw === 2) {
      const petal = wilt > 0 ? mix(C.acid, C.wilt, wilt) : (st >= 4.5 ? C.gold : C.acid);
      rect(ctx, tx - 3, topY - 3, 8, 4, petal);
      rect(ctx, tx - 1, topY - 5, 4, 8, petal);
      rect(ctx, tx - 1, topY - 3, 4, 4, st >= 4.5 ? C.orange : C.grass2);
      if (st >= 4.5) { rect(ctx, tx - 5, topY - 2, 2, 2, petal); rect(ctx, tx + 5, topY - 2, 2, 2, petal); rect(ctx, tx, topY - 7, 2, 2, petal); }
    } else if (st >= 1 && st < 3.5 && sw === 2) {
      rect(ctx, tx - 2, topY - 2, 2, 2, leafHi); rect(ctx, tx + 2, topY - 2, 2, 2, leafHi);
    }
    if (st >= 3.5 && sw === 1) {
      // flower head: grows into a HYPE-gold bloom at stage 5
      const petal = wilt > 0 ? mix(C.acid, C.wilt, wilt) : (st >= 4.5 ? C.gold : C.acid);
      rect(ctx, tx - 1, topY - 1, 3, 1, petal);
      rect(ctx, tx, topY - 2, 1, 3, petal);
      rect(ctx, tx, topY - 1, 1, 1, st >= 4.5 ? C.orange : C.grass2);
      if (st >= 4.5) {
        rect(ctx, tx - 2, topY - 1, 1, 1, petal);
        rect(ctx, tx + 2, topY - 1, 1, 1, petal);
        rect(ctx, tx, topY - 3, 1, 1, petal);
      }
    }
  }

  /* ---------------- brand mark ---------------- */
  $$('.brand-mark').forEach((cv) => paintSpriteCanvas(cv, 'mark'));

  /* ---------------- sprite icons ---------------- */
  $$('canvas[data-art]').forEach((cv) => paintSpriteCanvas(cv, cv.dataset.art));

  /* ---------------- reading the round from the page ---------------- */
  const timerEl = $('#timer');
  const roundEl = $('#round-indicator');
  function roundState() {
    const m = /(\d+):(\d+)/.exec(timerEl ? timerEl.textContent : '');
    const secs = m ? (+m[1]) * 60 + (+m[2]) : 900;
    const live = roundEl && !/LAUNCH/i.test(roundEl.textContent);
    return { secs, live };
  }

  /* ================= HERO FIELD ================= */
  const field = $('#field-canvas');
  if (field) {
    const W = 192, H = 124;
    const ctx = field.getContext('2d');
    const HORIZON = 50;
    seed = 11;
    // crop grid in fake perspective: rows get wider and lower toward the viewer
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const y = HORIZON + 12 + r * 8 + r * r * 0.9;
      const spacing = 8 + r * 2.4;
      const big = 0.6 + r * 0.22;
      const crops = [];
      for (let x = -spacing + (r % 2) * spacing / 2; x < W + spacing; x += spacing) {
        crops.push({ x: Math.round(x + (rnd() - 0.5) * 2), phase: rnd() * 6.28, lag: rnd() * 0.18 });
      }
      rows.push({ y: Math.round(y), big, crops });
    }
    const clouds = [
      { x: 20, y: 8, w: 26, s: 2.2 }, { x: 110, y: 20, w: 18, s: 3.4 }, { x: 160, y: 4, w: 30, s: 1.6 },
    ];
    const birds = [{ x: 40, y: 16, s: 14, p: 0 }, { x: -10, y: 24, s: 12, p: 1.5 }];
    const motes = Array.from({ length: 22 }, () => ({ x: rnd() * W, y: HORIZON + rnd() * (H - HORIZON), p: rnd() * 6.28, s: 0.3 + rnd() * 0.6 }));
    const coins = [];
    let lastProgress = 0;
    let mx = 0;

    field.addEventListener('pointermove', (e) => {
      const r = field.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    });
    field.addEventListener('pointerleave', () => { mx = 0; });
    field.addEventListener('click', (e) => {
      const r = field.getBoundingClientRect();
      burst(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, 14);
    });

    function burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        coins.push({ x, y, vx: (Math.random() - 0.5) * 70, vy: -40 - Math.random() * 70, life: 1.4 + Math.random() * 0.6, spin: Math.random() * 6 });
      }
    }
    function harvest() {
      rows.forEach((row) => row.crops.forEach((c, i) => {
        if (i % 2 === 0 && c.x > 0 && c.x < W) burst(c.x, row.y - 8 * row.big, 1);
      }));
      const hud = $('.field-hud');
      if (hud) { hud.classList.remove('final'); }
    }

    const SKY = [ // [progress, top, low]
      [0, '#f6b79b', '#ffe6c2'], [0.18, '#8fd3e0', '#dff4ee'], [0.6, '#6fc3de', '#cdeef0'],
      [0.74, '#c4b4ea', '#ffe0cc'], [0.88, '#f59a8a', '#ffd28a'], [1, '#3b3f6e', '#f2876a'],
    ];
    function sky(ctx, p) {
      let i = 0; while (i < SKY.length - 2 && p > SKY[i + 1][0]) i++;
      const A = SKY[i], B = SKY[i + 1], k = clamp((p - A[0]) / (B[0] - A[0]), 0, 1);
      const top = rgbHex(mix(A[1], B[1], k)), low = rgbHex(mix(A[2], B[2], k));
      const bands = 7;
      for (let j = 0; j < bands; j++) rect(ctx, 0, (j * HORIZON) / bands, W, Math.ceil(HORIZON / bands) + 1, mix(top, low, j / (bands - 1)));
      if (p > 0.86) { // first stars at dusk
        const n = Math.round((p - 0.86) / 0.14 * 9);
        for (let j = 0; j < n; j++) rect(ctx, (j * 53 + 17) % W, 3 + (j * 29) % 22, 1, 1, '#fff6d8');
      }
    }
    function rgbHex(rgb) {
      const v = rgb.match(/\d+/g).map((n) => (+n).toString(16).padStart(2, '0'));
      return `#${v.join('')}`;
    }
    function sun(ctx, p) {
      const a = Math.PI * (1 - p);
      const x = Math.round(W / 2 + Math.cos(a) * 78);
      const y = Math.round(HORIZON - 8 - Math.sin(a) * 30);
      const col = p > 0.8 ? C.orange : C.gold;
      rect(ctx, x - 4, y - 6, 9, 13, col);
      rect(ctx, x - 6, y - 4, 13, 9, col);
      rect(ctx, x - 5, y - 5, 11, 11, col);
      rect(ctx, x - 2, y - 3, 3, 2, '#fff3b8');
    }
    function cloud(ctx, c) {
      const x = Math.round(c.x), y = c.y, w = c.w;
      rect(ctx, x, y + 3, w, 4, C.cloud);
      rect(ctx, x + 3, y + 1, w * 0.45, 3, C.cloud);
      rect(ctx, x + w * 0.4, y, w * 0.35, 4, C.cloud);
      rect(ctx, x + 1, y + 7, w - 2, 1, '#d7e8e2');
    }
    function hills(ctx, off) {
      // far hills
      for (let x = 0; x < W; x++) {
        const h = 10 + Math.round(Math.sin((x + off * 0.5) * 0.045) * 5 + Math.sin((x + off * 0.5) * 0.11) * 2);
        rect(ctx, x, HORIZON - h, 1, h, C.hill2);
      }
      for (let x = 0; x < W; x++) {
        const h = 5 + Math.round(Math.sin((x + off) * 0.07 + 2) * 3 + Math.sin((x + off) * 0.19) * 1);
        rect(ctx, x, HORIZON - h, 1, h, C.hill);
      }
      // a tiny barn on the hill
      const bx = Math.round(150 + off * 0.5);
      rect(ctx, bx, HORIZON - 14, 10, 7, C.orange2);
      rect(ctx, bx + 1, HORIZON - 17, 8, 3, C.ink);
      rect(ctx, bx + 3, HORIZON - 19, 4, 2, C.ink);
      rect(ctx, bx + 4, HORIZON - 11, 2, 4, C.ink);
      // windmill with turning sails
      const wx = Math.round(38 + off * 0.5), wy = HORIZON - 12;
      rect(ctx, wx - 2, wy, 5, 9, C.paper); rect(ctx, wx - 1, wy - 3, 3, 3, C.paper); rect(ctx, wx, wy + 5, 1, 4, C.ink);
      rect(ctx, wx - 2, wy + 3, 5, 1, '#c9d3c0');
      const ang = REDUCED ? 0.4 : hillT * 1.4;
      for (let k = 0; k < 4; k++) {
        const a2 = ang + k * Math.PI / 2;
        for (let r = 1; r <= 7; r++) rect(ctx, wx + Math.cos(a2) * r, wy - 2 + Math.sin(a2) * r, 1, 1, r > 2 ? C.ink : C.soil2);
      }
      rect(ctx, wx, wy - 2, 1, 1, C.orange);
      // fence along the field edge
      for (let x = 0; x < W; x += 6) { rect(ctx, x + 1, HORIZON - 3, 1, 4, C.soil3); }
      rect(ctx, 0, HORIZON - 2, W, 1, C.soil3);
    }
    let hillT = 0;
    function scarecrow(ctx, x, t) {
      const y = HORIZON + 26, tilt = REDUCED ? 0 : Math.round(Math.sin(t * 1.5));
      rect(ctx, x, y - 12, 1, 13, C.soil2);            // pole
      rect(ctx, x - 4, y - 9, 9, 1, C.soil2);          // arms
      rect(ctx, x - 2, y - 9, 5, 5, C.orange);         // shirt
      rect(ctx, x - 4 , y - 8 + tilt, 1, 2, C.orange); rect(ctx, x + 4, y - 8 - tilt, 1, 2, C.orange);
      rect(ctx, x - 1, y - 13, 3, 3, C.gold);          // head
      rect(ctx, x - 2, y - 14, 5, 1, C.ink); rect(ctx, x - 1, y - 15, 3, 1, C.ink); // hat
    }
    function ground(ctx) {
      rect(ctx, 0, HORIZON, W, H - HORIZON, C.soil);
      rows.forEach((row, r) => {
        rect(ctx, 0, row.y + 1, W, 1 + Math.floor(r / 2), C.soil2);
        rect(ctx, 0, row.y - 3 - r, W, 1, C.soil3);
      });
    }

    let demoT = 15; // start the pre-launch illustration with the crops already up
    scene(field, (t, dt) => {
      const { secs, live } = roundState();
      let p;
      if (live) p = clamp(1 - secs / 900, 0, 1);
      else { demoT += dt; p = (demoT % 24) / 24; } // before launch: a 24 s illustrative cycle
      if (p < lastProgress - 0.5) harvest();
      lastProgress = p;
      const hud = $('.field-hud');
      if (hud) hud.classList.toggle('final', live && secs <= 10 && secs > 0);

      const off = mx * 4;
      sky(ctx, p);
      sun(ctx, p);
      clouds.forEach((c) => {
        if (!REDUCED) c.x += c.s * dt;
        if (c.x > W + 4) c.x = -c.w - 4;
        cloud(ctx, c);
      });
      birds.forEach((b) => {
        if (!REDUCED) b.x += b.s * dt;
        if (b.x > W + 30) { b.x = -40 - Math.random() * 120; b.y = 10 + Math.random() * 20; }
        const flap = Math.sin(t * 9 + b.p) > 0 ? 1 : 0;
        const bx = Math.round(b.x), by = Math.round(b.y + Math.sin(t * 2 + b.p) * 2);
        rect(ctx, bx, by, 1, 1, C.ink);
        rect(ctx, bx - 1, by - flap, 1, 1, C.ink);
        rect(ctx, bx + 1, by - flap, 1, 1, C.ink);
        rect(ctx, bx - 2, by - 1 + flap * 0, 1, 1, flap ? C.ink : 'rgba(0,0,0,0)');
        rect(ctx, bx + 2, by - 1, 1, 1, flap ? C.ink : 'rgba(0,0,0,0)');
      });
      hillT = t;
      hills(ctx, off);
      ground(ctx);
      scarecrow(ctx, Math.round(118 + off * 1.2), t);
      const wind = REDUCED ? 0 : Math.sin(t * 1.3) * 1.2;
      rows.forEach((row, r) => {
        const shift = Math.round(off * (r + 1) * 0.35);
        row.crops.forEach((c) => {
          const stage = clamp((p - c.lag) * 7, 0, 5);
          const sway = REDUCED ? 0 : wind + Math.sin(t * 2.2 + c.phase + c.x * 0.05) * (0.6 + row.big * 0.6);
          drawCrop(ctx, c.x + shift, row.y, stage, sway, 0, row.big);
        });
      });
      // floating pollen
      motes.forEach((m) => {
        const y = m.y + Math.sin(t * m.s * 2 + m.p) * 3;
        const x = (m.x + t * 4 * m.s) % W;
        if (Math.sin(t * 3 + m.p) > 0.2) rect(ctx, x, y, 1, 1, '#f6ffd0');
      });
      // a little tractor working the middle row, puffing smoke
      {
        const row = rows[3], ty = row.y - 1;
        const tx = Math.round(((t * 9) % (W + 60)) - 30);
        rect(ctx, tx, ty - 7, 9, 5, C.orange); rect(ctx, tx + 5, ty - 11, 4, 4, C.orange2);
        rect(ctx, tx + 6, ty - 10, 2, 2, C.sky2); rect(ctx, tx + 1, ty - 10, 1, 3, C.ink);
        rect(ctx, tx + 5, ty - 4, 5, 5, C.ink); rect(ctx, tx + 7, ty - 2, 1, 1, C.gold);
        rect(ctx, tx, ty - 2, 3, 3, C.ink);
        if (!REDUCED) for (let k = 0; k < 3; k++) {
          const a = (t * 1.6 + k / 3) % 1;
          rect(ctx, tx + 1 - a * 5, ty - 12 - a * 7, a > 0.5 ? 2 : 1, a > 0.5 ? 2 : 1, 'rgba(247,251,244,' + (0.8 - a * 0.7) + ')');
        }
      }
      // fireflies come out at dusk
      if (p > 0.78) for (let k = 0; k < 14; k++) {
        if (Math.sin(t * 2.4 + k * 1.7) > 0.3) rect(ctx, (k * 37 + Math.sin(t * 0.6 + k) * 6 + 200) % W, HORIZON + 6 + (k * 23) % 60 + Math.cos(t * 0.8 + k) * 3, 1, 1, C.acid);
      }
      // HYPE coins from the harvest
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.vy += 120 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; c.spin += dt * 10;
        if (c.life <= 0 || c.y > H + 4) { coins.splice(i, 1); continue; }
        const thin = Math.abs(Math.cos(c.spin)) < 0.4;
        rect(ctx, c.x - (thin ? 0 : 1), c.y - 1, thin ? 1 : 3, 3, C.gold);
        if (!thin) rect(ctx, c.x, c.y, 1, 1, C.acid);
        rect(ctx, c.x - (thin ? 0 : 1), c.y + 2, thin ? 1 : 3, 1, C.gold2);
      }
      // vignette pixels in the corners
      rect(ctx, 0, 0, 2, 1, C.ink); rect(ctx, 0, 0, 1, 2, C.ink);
      rect(ctx, W - 2, 0, 2, 1, C.ink); rect(ctx, W - 1, 0, 1, 2, C.ink);
    });
  }

  /* ================= GROW SIMULATOR ================= */
  const plant = $('#plant-canvas');
  if (plant) {
    const ctx = plant.getContext('2d');
    const W = 96, H = 96, G = 86;
    const bagIn = $('#sim-bag'), timeIn = $('#sim-time');
    const out = {
      bag: $('#sim-bag-out'), time: $('#sim-time-out'), mult: $('#sim-mult'),
      weight: $('#sim-weight'), next: $('#sim-next'), note: $('#sim-note'),
    };
    const TIERS = [[0, 1], [10, 1.5], [60, 2], [120, 3], [180, 4], [240, 5]];
    const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    const held = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);
    const bagOf = (v) => Math.round(Math.pow(10, 5 + (v / 100) * 3) / 1000) * 1000; // 100K .. 100M
    const tierOf = (min) => { let s = 0; TIERS.forEach(([t], i) => { if (min >= t) s = i; }); return s; };
    const DEFAULT_NOTE = out.note ? out.note.textContent : '';

    let shown = 0;      // displayed stage, eases toward target
    let wilt = 0;       // 0..1 while selling
    let selling = 0;    // seconds left in the sell animation
    const flyers = [];
    const sparks = [];

    const stageCanvases = $$('#stages canvas');
    stageCanvases.forEach((cv, i) => {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, 16, 16);
      rect(c, 0, 15, 16, 1, C.soil2);
      drawCrop(c, 8, 15, i, 0, 0, 1);
    });

    function fill(input) {
      const p = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty('--fill', `${p}%`);
    }
    function update() {
      const bag = bagOf(+bagIn.value);
      const min = +timeIn.value * 5;
      const s = tierOf(min);
      const mult = TIERS[s][1];
      out.bag.textContent = compact(bag);
      out.time.textContent = held(min);
      out.mult.textContent = `${mult}x`;
      out.weight.textContent = compact(bag * mult);
      out.next.textContent = s >= 5 ? 'Maxed' : `${TIERS[s + 1][1]}x in ${held(TIERS[s + 1][0] - min)}`;
      $$('#stages li').forEach((li, i) => {
        li.classList.toggle('reached', i < s);
        li.classList.toggle('current', i === s);
      });
      fill(bagIn); fill(timeIn);
      if (!selling && out.note.classList.contains('sold')) {
        out.note.classList.remove('sold');
        out.note.textContent = DEFAULT_NOTE;
      }
      if (s === 5 && !selling) out.note.textContent = 'Fully grown. Every harvest now counts this bag five times over.';
      else if (!selling && s < 5) out.note.textContent = DEFAULT_NOTE;
      plant.setAttribute('aria-label', `Crop at ${mult}x after ${held(min)} with a ${compact(bag)} bag`);
    }
    bagIn.addEventListener('input', update);
    timeIn.addEventListener('input', update);

    let holdAnim = null;
    $('#sim-hold').addEventListener('click', () => {
      const target = Math.min(+timeIn.max, +timeIn.value + 12);
      clearInterval(holdAnim);
      if (REDUCED) { timeIn.value = target; update(); return; }
      holdAnim = setInterval(() => {
        if (+timeIn.value >= target) { clearInterval(holdAnim); return; }
        timeIn.value = +timeIn.value + 1;
        update();
      }, 60);
    });
    $('#sim-sell').addEventListener('click', () => {
      clearInterval(holdAnim);
      const min = +timeIn.value * 5;
      const was = TIERS[tierOf(min)][1];
      selling = REDUCED ? 0.01 : 1.6;
      for (let i = 0; i < 16; i++) {
        flyers.push({ x: 48, y: 50, vx: (i % 2 ? 1 : -1) * (30 + Math.random() * 40), vy: -50 - Math.random() * 40, life: 1.6 });
      }
      out.note.classList.add('sold');
      const soldText = was === 1
        ? "Sold. Your multiplier stays at 1x — and this round's share goes to the holders who stayed."
        : `Sold. ${was}x drops to 1x — and this round's share goes to the holders who stayed.`;
      out.note.textContent = soldText;
      setTimeout(() => { timeIn.value = 0; update(); out.note.classList.add('sold'); out.note.textContent = soldText; }, REDUCED ? 0 : 900);
    });
    update();

    // when the section scrolls into view, the crop grows from seed to the shown stage once
    let touched = false;
    [bagIn, timeIn].forEach((i) => i.addEventListener('pointerdown', () => { touched = true; }));
    if (!REDUCED && 'IntersectionObserver' in window) {
      const goal = +timeIn.value;
      timeIn.value = 0; update();
      const gio = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        gio.disconnect();
        const iv = setInterval(() => {
          if (touched || +timeIn.value >= goal) { clearInterval(iv); return; }
          timeIn.value = +timeIn.value + 1; update();
        }, 110);
      }, { threshold: 0.45 });
      gio.observe(plant);
    }

    scene(plant, (t, dt) => {
      const min = +timeIn.value * 5;
      const target = tierOf(min);
      shown += (target - shown) * Math.min(1, dt * 6);
      if (REDUCED) shown = target;
      if (selling > 0) { selling -= dt; wilt = Math.min(1, wilt + dt * 2.2); } else wilt = Math.max(0, wilt - dt * 1.5);
      const bagScale = 2.3 + (+bagIn.value / 100) * 1.2;

      // sky + sun
      for (let i = 0; i < 6; i++) rect(ctx, 0, i * 11, W, 12, mix('#9ad6e2', '#dff4ee', i / 5));
      rect(ctx, 70, 10, 10, 10, C.gold); rect(ctx, 68, 12, 14, 6, C.gold); rect(ctx, 72, 8, 6, 14, C.gold);
      const cx = Math.round(((t * 3) % 130) - 30);
      rect(ctx, cx, 22, 20, 4, C.cloud); rect(ctx, cx + 4, 19, 9, 3, C.cloud);
      // far field
      for (let x = 0; x < W; x++) rect(ctx, x, 62 - Math.round(Math.sin(x * 0.08) * 3 + 3), 1, 12, C.hill2);
      rect(ctx, 0, 70, W, H - 70, C.soil);
      for (let y = 74; y < H; y += 5) rect(ctx, 0, y, W, 1, C.soil2);
      // side crops at the current tier, smaller
      const sway = REDUCED ? 0 : Math.sin(t * 1.8) * 1.4;
      [10, 24, 72, 86].forEach((x, i) => drawCrop(ctx, x, 76 + (i % 2) * 3, Math.max(0, shown - 1), sway * 0.7, wilt * 0.6, 0.9));
      // the main crop
      drawCrop(ctx, 48, G, shown, sway * 1.4, wilt, bagScale);
      // sparkle at max
      if (target === 5 && !wilt && !REDUCED && Math.random() < dt * 8) {
        sparks.push({ x: 48 + (Math.random() - 0.5) * 30, y: 30 + Math.random() * 30, life: 0.6 });
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life -= dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        rect(ctx, s.x, s.y - 1, 1, 3, C.paper); rect(ctx, s.x - 1, s.y, 3, 1, C.paper);
      }
      // forfeit coins fly off to the neighbours
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.vy += 90 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt;
        if (f.life <= 0) { flyers.splice(i, 1); continue; }
        rect(ctx, f.x - 1, f.y - 1, 3, 3, C.gold); rect(ctx, f.x, f.y, 1, 1, C.acid);
      }
    });
  }

  /* ================= FOOTER STRIP ================= */
  const foot = $('#footer-field');
  if (foot) {
    const ctx = foot.getContext('2d');
    const W = 320, H = 40;
    seed = 3;
    const crops = Array.from({ length: 46 }, (_, i) => ({ x: i * 7 + Math.round(rnd() * 3), st: 1 + rnd() * 4, p: rnd() * 6.28 }));
    scene(foot, (t) => {
      ctx.clearRect(0, 0, W, H);
      rect(ctx, 0, 34, W, 6, C.soil);
      rect(ctx, 0, 34, W, 1, C.soil3);
      for (let x = 0; x < W; x += 3) rect(ctx, x, 33 - ((x * 7) % 3 === 0 ? 1 : 0), 2, 1, C.grass3);
      crops.forEach((c) => drawCrop(ctx, c.x, 34, c.st, REDUCED ? 0 : Math.sin(t * 1.6 + c.p) * 1.3, 0, 1.1));
    });
  }

  /* ================= MOTION LAYER ================= */
  // staggered entrances
  const reveals = $$('.reveal');
  const groups = new Map();
  reveals.forEach((el) => {
    const key = el.parentElement;
    const i = groups.get(key) || 0;
    groups.set(key, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 5) * 0.08}s`);
  });
  if (REDUCED || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
    // never leave content hidden if the observer is slow
    setTimeout(() => reveals.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }), 1200);
  }

  // number bump when fields.js writes a new value
  if (!REDUCED && 'MutationObserver' in window) {
    $$('[data-count]').forEach((el) => {
      let prev = el.textContent;
      new MutationObserver(() => {
        if (el.textContent === prev || el.dataset.counting) { prev = el.textContent; return; }
        prev = el.textContent;
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // top bar + scroll spy
  const topbar = $('#topbar');
  const links = $$('#main-nav a');
  const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  function onScroll() {
    topbar && topbar.classList.toggle('scrolled', scrollY > 8);
    let cur = targets[0];
    targets.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s; });
    links.forEach((a) => a.classList.toggle('active', cur && a.getAttribute('href') === `#${cur.id}`));
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ================= SCROLL LAYER ================= */
  // 1. page progress: a row of pixel blocks under the top bar
  const bar = document.createElement('div');
  bar.className = 'scroll-bar';
  bar.setAttribute('aria-hidden', 'true');
  if (topbar) topbar.appendChild(bar);

  // 2. footer wordmark: letters rise one by one
  const word = $('.foot-word');
  if (word) word.innerHTML = [...word.textContent].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');

  // 3. cards "grow" upward in pixel steps, headings type on left to right
  $$('.stat-card, .sim, .grow-stage, .board, .rules-panel, .loop-steps li').forEach((el) => el.classList.add('pix'));
  $$('.loop-steps li').forEach((li, i) => { li.classList.add('reveal'); li.style.setProperty('--d', `${0.15 + i * 0.15}s`); });
  $$('h1.reveal, h2.reveal').forEach((el) => el.classList.add('type'));

  // 4. counters count up the first time a card comes into view
  function countUp(el) {
    const m = /^([\d.,]+)([KM]?)$/.exec(el.textContent.trim());
    if (!m) return;
    const target = parseFloat(m[1].replace(/,/g, ''));
    if (!(target > 0)) return;
    const dec = (m[1].split('.')[1] || '').length;
    const final = el.textContent;
    const t0 = performance.now();
    let wrote = final;
    el.dataset.counting = '1';
    const step = (now) => {
      // fields.js wrote a fresh value meanwhile: stop and keep it
      if (el.textContent !== wrote) { delete el.dataset.counting; return; }
      const k = Math.min(1, (now - t0) / 900);
      const v = target * (1 - Math.pow(1 - k, 3));
      wrote = k < 1 ? `${dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')}${m[2]}` : final;
      el.textContent = wrote;
      if (k < 1) requestAnimationFrame(step); else delete el.dataset.counting;
    };
    requestAnimationFrame(step);
  }

  if (!REDUCED && 'IntersectionObserver' in window) {
    const once = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      once.unobserve(e.target);
      if (e.target.matches('.foot-word')) e.target.classList.add('in');
      else $$('[data-count]', e.target).forEach(countUp);
    }), { threshold: 0.35 });
    if (word) once.observe(word);
    $$('.stat-card').forEach((c) => once.observe(c));

    // Clipped items (cards growing, headings typing) are invisible to IntersectionObserver
    // while clipped, so watch their parent, which is never clipped.
    const byParent = new Map();
    $$('.reveal.pix, .reveal.type').forEach((el) => {
      const p = el.parentElement;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(el);
    });
    const io2 = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      byParent.get(e.target).forEach((el) => el.classList.add('in'));
      io2.unobserve(e.target);
    }), { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    byParent.forEach((_, p) => io2.observe(p));

    // 5. scroll-linked: progress bar, hero parallax, ticker that reacts to scroll speed
    const heroSec = $('.hero'), heroCopy = $('.hero-copy'), heroField = $('.hero-field'), grow = $('.grow');
    const track = $('.ticker-track');
    let lastY = scrollY, vel = 0, tickX = 0, dir = -1;
    if (track) track.style.animation = 'none';
    scenes.push({
      el: document.body, visible: true,
      draw: (t, dt) => {
        const y = scrollY;
        const dy = y - lastY; lastY = y;
        vel = vel * 0.9 + (dt ? dy / dt : 0) * 0.1;
        if (Math.abs(dy) > 1) dir = dy > 0 ? -1 : 1;
        // progress bar in 40 blocks
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.setProperty('--p', `${Math.round((max > 0 ? y / max : 0) * 40) * 2.5}%`);
        // hero: copy drifts up and fades, the field window sinks a little slower
        if (heroSec) {
          const h = heroSec.offsetHeight;
          const p = clamp(y / h, 0, 1);
          if (heroCopy) { heroCopy.style.translate = `0 ${Math.round(-p * 90 / 4) * 4}px`; heroCopy.style.opacity = String(1 - Math.max(0, p - 0.35) * 0.9); }
          if (heroField) heroField.style.translate = `0 ${Math.round(p * 60 / 4) * 4}px`;
        }
        // grow section background dots slide with scroll
        if (grow) grow.style.setProperty('--gy', `${Math.round((y * 0.15) / 4) * 4}px`);
        // ticker: base speed plus a kick from scroll velocity, flips with direction
        if (track) {
          const half = track.scrollWidth / 2;
          tickX += dir * (60 + Math.min(900, Math.abs(vel) * 0.6)) * dt;
          if (tickX <= -half) tickX += half;
          if (tickX > 0) tickX -= half;
          track.style.transform = `translateX(${tickX.toFixed(1)}px)`;
        }
      },
    });
  } else if (word) {
    word.classList.add('in');
  }

  /* ================= AMBIENT FLOWERS (whole page) =================
     A fixed pixel layer over the page: falling petals and tiny flowers,
     dandelion seeds rising, now and then a butterfly. Scroll adds wind,
     the cursor pushes petals away. Never catches clicks. */
  if (!REDUCED) {
    const amb = document.createElement('canvas');
    amb.className = 'ambient';
    amb.setAttribute('aria-hidden', 'true');
    document.body.appendChild(amb);
    const actx = amb.getContext('2d');
    const PX = innerWidth > 1000 ? 5 : 4; // one art pixel = 4-5 css px
    let AW = 0, AH = 0;
    const resize = () => {
      AW = Math.ceil(innerWidth / PX); AH = Math.ceil(innerHeight / PX);
      amb.width = AW; amb.height = AH;
    };
    resize();
    addEventListener('resize', resize);

    const PETAL = [C.acid, C.orange, C.paper, C.grass, '#ffc2b0', C.gold];
    const small = innerWidth < 700;
    const mk = (kind, y) => ({
      kind,
      x: Math.random() * AW,
      y: y ?? Math.random() * AH,
      vx: 0, vy: 0,
      fall: kind === 'seed' ? -(3 + Math.random() * 4) : 6 + Math.random() * 9,
      sway: 4 + Math.random() * 8,
      p: Math.random() * 6.28,
      c: PETAL[(Math.random() * PETAL.length) | 0],
      spin: 2 + Math.random() * 4,
    });
    const parts = [];
    const nPetals = small ? 6 : 12, nFlowers = small ? 4 : 9, nSeeds = small ? 2 : 5;
    for (let i = 0; i < nPetals; i++) parts.push(mk('petal'));
    for (let i = 0; i < nFlowers; i++) parts.push(mk('flower'));
    for (let i = 0; i < nSeeds; i++) parts.push(mk('seed'));
    const flies = [{ x: -20, y: 40, dir: 1, wait: 3, c: C.orange }, { x: -20, y: 90, dir: -1, wait: 11, c: C.acid }];

    let mxA = -999, myA = -999;
    addEventListener('pointermove', (e) => { mxA = e.clientX / PX; myA = e.clientY / PX; }, { passive: true });
    let lastSY = scrollY, wind = 0;

    const px1 = (x, y, c) => { actx.fillStyle = c; actx.fillRect(Math.round(x), Math.round(y), 1, 1); };
    function drawPetal(o, t) {
      const f = Math.floor((t * o.spin + o.p) % 4); // 4-frame tumble
      const x = o.x, y = o.y;
      if (f === 0) { px1(x, y, o.c); px1(x + 1, y, o.c); px1(x, y + 1, o.c); }
      else if (f === 1) { px1(x, y, o.c); px1(x + 1, y + 1, o.c); }
      else if (f === 2) { px1(x, y, o.c); px1(x + 1, y, o.c); px1(x + 1, y + 1, o.c); }
      else { px1(x, y, o.c); px1(x, y + 1, o.c); }
    }
    function drawFlower(o, t) {
      const x = Math.round(o.x), y = Math.round(o.y);
      const centre = o.c === C.gold ? C.orange : C.gold;
      const open = Math.sin(t * o.spin * 0.5 + o.p) > -0.2; // blooms, closes, blooms
      if (open) {
        // .pp.
        // pccp
        // pccp
        // .pp.
        px1(x + 1, y, o.c); px1(x + 2, y, o.c);
        px1(x, y + 1, o.c); px1(x + 3, y + 1, o.c); px1(x, y + 2, o.c); px1(x + 3, y + 2, o.c);
        px1(x + 1, y + 3, o.c); px1(x + 2, y + 3, o.c);
        px1(x + 1, y + 1, centre); px1(x + 2, y + 1, centre); px1(x + 1, y + 2, centre); px1(x + 2, y + 2, centre);
      } else {
        // p..p / .cc. / .cc. / p..p
        px1(x, y, o.c); px1(x + 3, y, o.c); px1(x, y + 3, o.c); px1(x + 3, y + 3, o.c);
        px1(x + 1, y + 1, centre); px1(x + 2, y + 1, centre); px1(x + 1, y + 2, centre); px1(x + 2, y + 2, centre);
      }
    }
    function drawSeed(o) {
      const x = o.x, y = o.y;
      px1(x, y, 'rgba(247,251,244,.9)'); px1(x - 1, y - 1, 'rgba(247,251,244,.6)'); px1(x + 1, y - 1, 'rgba(247,251,244,.6)');
      px1(x, y + 1, 'rgba(160,140,90,.8)');
    }
    function drawFly(b, t) {
      const flap = Math.sin(t * 14) > 0;
      const x = Math.round(b.x), y = Math.round(b.y);
      px1(x, y, C.ink); px1(x, y + 1, C.ink);
      if (flap) { px1(x - 1, y - 1, b.c); px1(x - 2, y - 1, b.c); px1(x + 1, y - 1, b.c); px1(x + 2, y - 1, b.c); px1(x - 1, y, b.c); px1(x + 1, y, b.c); }
      else { px1(x - 1, y, b.c); px1(x + 1, y, b.c); px1(x - 1, y + 1, b.c); px1(x + 1, y + 1, b.c); }
    }

    scenes.push({
      el: amb, visible: true,
      draw: (t, dt) => {
        if (!dt) return;
        const sy = scrollY;
        wind = wind * 0.92 + ((sy - lastSY) / PX) * 0.6; // scroll kicks the petals
        lastSY = sy;
        actx.clearRect(0, 0, AW, AH);
        for (const o of parts) {
          // cursor pushes away
          const dx = o.x - mxA, dy = o.y - myA, d2 = dx * dx + dy * dy;
          if (d2 < 140) { const k = (140 - d2) / 140 * 60; const d = Math.sqrt(d2) || 1; o.vx += (dx / d) * k * dt * 6; o.vy += (dy / d) * k * dt * 6; }
          o.vx *= 0.94; o.vy *= 0.94;
          o.x += (Math.sin(t * 0.8 + o.p) * o.sway * 0.3 + o.vx) * dt;
          o.y += (o.fall - wind * (o.kind === 'seed' ? 0.6 : 1.2) + o.vy) * dt;
          if (o.y > AH + 3) { Object.assign(o, mk(o.kind, -3)); }
          if (o.y < -4) { Object.assign(o, mk(o.kind, AH + 3)); }
          if (o.x < -3) o.x = AW + 2; else if (o.x > AW + 3) o.x = -2;
          if (o.kind === 'petal') drawPetal(o, t);
          else if (o.kind === 'flower') drawFlower(o, t);
          else drawSeed(o);
        }
        for (const b of flies) {
          if (b.wait > 0) { b.wait -= dt; b.x = b.dir > 0 ? -6 : AW + 6; continue; }
          b.x += b.dir * 14 * dt;
          b.y += Math.sin(t * 2.3 + b.dir) * 10 * dt + Math.cos(t * 5) * 4 * dt;
          b.y = clamp(b.y, 30 / PX + 10, AH - 10);
          if (b.x < -10 || b.x > AW + 10) { b.wait = 8 + Math.random() * 14; b.y = 20 + Math.random() * (AH - 40); }
          else drawFly(b, t);
        }
      },
    });
  }

  ['#round-indicator', '#data-stamp'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    const clean = () => {
      const m = /[A-Za-z0-9#]/.exec(el.textContent);
      const txt = m ? el.textContent.slice(m.index) : el.textContent;
      if (txt !== el.textContent) el.textContent = txt;
    };
    clean();
    new MutationObserver(clean).observe(el, { childList: true, characterData: true, subtree: true });
  });


  /* ================= DESIGN PASS 3: more life ================= */
  // hero headline: letters that hop in a wave
  const h1 = $('#hero-title');
  if (h1 && !h1.querySelector('.ch')) {
    const text = h1.textContent.trim();
    h1.setAttribute('aria-label', text);
    let i = 0;
    h1.innerHTML = text.split(' ').map((w) => `<span class="wd" aria-hidden="true">${[...w].map((ch) => `<span class="ch${ch === '.' ? ' dot' : ''}" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join(' ');
  }

  // countdown blocks shimmer in a wave
  const tagBlocks = () => $$('#progress-blocks span').forEach((b, i) => b.style.setProperty('--n', i));
  tagBlocks(); setTimeout(tagBlocks, 1500);

  // the empty board: a seed that keeps trying to sprout
  const seedCv = $('.empty-art');
  if (seedCv && !REDUCED) {
    const seq = ['seed', 'seed', 'sprout', 'sprout', 'seed'];
    let k = 0;
    setInterval(() => { if (seedCv.offsetParent) paintSpriteCanvas(seedCv, seq[k = (k + 1) % seq.length]); }, 900);
  }

  // living grass along section edges
  function grassEdge(host, dark) {
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.className = 'grass-edge';
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    const g = cv.getContext('2d');
    const GH = 16;
    let GW = 0, blades = [];
    const build = () => {
      GW = Math.ceil(host.clientWidth / 4);
      cv.width = GW; cv.height = GH;
      let sd = 5;
      const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      blades = [];
      for (let x = 0; x < GW; x += 1 + Math.floor(r() * 2)) blades.push({ x, h: 2 + Math.floor(r() * 5), p: r() * 6.28, c: r() < 0.5 ? C.grass2 : (r() < 0.5 ? C.grass3 : C.grass), f: r() < 0.035 ? 3.6 + r() * 1.4 : 0 });
    };
    build();
    addEventListener('resize', build);
    scene(cv, (t) => {
      g.clearRect(0, 0, GW, GH);
      for (const b of blades) {
        const sw = REDUCED ? 0 : Math.sin(t * 1.7 + b.p + b.x * 0.08);
        if (b.f) { drawCrop(g, b.x, GH, b.f, sw * 1.2, 0, 0.8); continue; }
        for (let y = 0; y < b.h; y++) { g.fillStyle = b.c; g.fillRect(b.x + Math.round(sw * (y / b.h) * 1.4), GH - 1 - y, 1, 1); }
      }
      if (dark) { g.fillStyle = C.forest; g.fillRect(0, GH - 1, GW, 1); }
    });
  }
  grassEdge($('.stats'));
  grassEdge($('.holders'), true);

  if (!REDUCED) requestAnimationFrame(frame);
})();
