/* world.js — the 960x540 tile overworld: programmatic pixel-art atlas, map,
 * five region landmarks, the mage, movement + collision, and canvas input.
 * No external assets; everything is drawn in code. */
(() => {
  'use strict';
  window.Game = window.Game || {};

  const TILE = 30;
  const COLS = 32; // 32 * 30 = 960
  const ROWS = 18; // 18 * 30 = 540
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const T = { GRASS: 0, GRASS2: 1, FLOWER: 2, FLOWER2: 3, PATH: 4, WATER: 5, TREE: 6 };
  const ATLAS_TILES = 7;

  /* Deterministic RNG so the world is identical every boot. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hex2rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* Desaturate + dim a hex color (used for locked landmarks). */
  function grayed(hex) {
    const [r, g, b] = hex2rgb(hex);
    const l = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.72);
    return `rgb(${l},${l},${l})`;
  }

  const World = {
    TILE,
    COLS,
    ROWS,
    canvas: null,
    ctx: null,
    atlas: null,
    bg: null, // pre-rendered static terrain
    map: null,
    solidMap: null,
    waterTiles: [],
    landmarks: [],
    keys: new Set(),
    player: {
      x: 3.5 * TILE,
      y: 15.6 * TILE,
      speed: 132, // px/s
      facing: 1, // 1 right, -1 left
      moving: false,
      frame: 0,
      frameT: 0,
    },

    /* ---------------- init ---------------- */

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.buildAtlas();
      this.defineLandmarks();
      this.buildMap();
      this.renderBackground();
      this.bindInput();
    },

    idx(x, y) {
      return y * COLS + x;
    },

    tileAt(x, y) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return T.TREE;
      return this.map[this.idx(x, y)];
    },

    isSolid(x, y) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
      return this.solidMap[this.idx(x, y)];
    },

    /* ---------------- tile atlas (offscreen, generated) ---------------- */

    buildAtlas() {
      const a = document.createElement('canvas');
      a.width = ATLAS_TILES * TILE;
      a.height = TILE;
      const c = a.getContext('2d');
      const rng = mulberry32(1234567);

      const fill = (i, color) => {
        c.fillStyle = color;
        c.fillRect(i * TILE, 0, TILE, TILE);
      };
      const dot = (i, x, y, w, h, color) => {
        c.fillStyle = color;
        c.fillRect(i * TILE + x, y, w, h);
      };

      const speckleGrass = (i, base, light, dark) => {
        fill(i, base);
        for (let k = 0; k < 9; k++) {
          dot(i, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 2, 2, light);
        }
        for (let k = 0; k < 6; k++) {
          dot(i, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 2, 3, dark);
        }
        for (let k = 0; k < 4; k++) {
          // little grass blades
          const bx = 3 + Math.floor(rng() * 24);
          const by = 6 + Math.floor(rng() * 20);
          dot(i, bx, by, 1, 4, dark);
          dot(i, bx + 1, by + 1, 1, 3, light);
        }
      };

      const flower = (i, x, y, petal, center) => {
        dot(i, x - 1, y, 1, 1, petal);
        dot(i, x + 1, y, 1, 1, petal);
        dot(i, x, y - 1, 1, 1, petal);
        dot(i, x, y + 1, 1, 1, petal);
        dot(i, x, y, 1, 1, center);
      };

      // 0 + 1: grass variants
      speckleGrass(T.GRASS, '#3e7a39', '#4c8f45', '#33682f');
      speckleGrass(T.GRASS2, '#3a7336', '#478842', '#2f612c');

      // 2 + 3: flowered grass
      speckleGrass(T.FLOWER, '#3e7a39', '#4c8f45', '#33682f');
      flower(T.FLOWER, 8, 9, '#e8e08a', '#c9a336');
      flower(T.FLOWER, 21, 19, '#d97fb0', '#8a3d6b');
      flower(T.FLOWER, 14, 25, '#e8e08a', '#c9a336');
      speckleGrass(T.FLOWER2, '#3a7336', '#478842', '#2f612c');
      flower(T.FLOWER2, 10, 20, '#c95f6e', '#7c2f3a');
      flower(T.FLOWER2, 22, 8, '#9fd0e8', '#4a7c9e');

      // 4: path
      fill(T.PATH, '#b99862');
      for (let k = 0; k < 8; k++) {
        dot(T.PATH, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 3, 2, '#a3854f');
      }
      for (let k = 0; k < 6; k++) {
        dot(T.PATH, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 2, 2, '#cfae79');
      }
      for (let k = 0; k < 4; k++) {
        dot(T.PATH, 3 + Math.floor(rng() * 24), 3 + Math.floor(rng() * 24), 2, 1, '#8f7343');
      }

      // 5: water
      fill(T.WATER, '#17456f');
      for (let k = 0; k < 7; k++) {
        dot(T.WATER, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 4, 2, '#123a5e');
      }
      for (let k = 0; k < 3; k++) {
        dot(T.WATER, 2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 3, 1, '#1d5585');
      }

      // 6: tree (drawn over grass)
      speckleGrass(T.TREE, '#3e7a39', '#4c8f45', '#33682f');
      const ti = T.TREE * TILE;
      c.fillStyle = 'rgba(0,0,0,0.22)'; // ground shadow
      c.beginPath();
      c.ellipse(ti + 15, 26, 9, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5c4326'; // trunk
      c.fillRect(ti + 13, 18, 4, 9);
      c.fillStyle = '#4a3620';
      c.fillRect(ti + 13, 18, 2, 9);
      const canopy = (cx, cy, r, color) => {
        c.fillStyle = color;
        c.beginPath();
        c.arc(ti + cx, cy, r, 0, Math.PI * 2);
        c.fill();
      };
      canopy(15, 13, 10, '#1f4d20');
      canopy(11, 11, 7, '#2c6a2b');
      canopy(18, 9, 6, '#2c6a2b');
      canopy(12, 8, 4, '#3f8a3c');

      this.atlas = a;
    },

    /* ---------------- landmarks ---------------- */

    defineLandmarks() {
      // tx,ty,tw,th: structure footprint in tiles (solid). trigger: path tile in front.
      this.landmarks = [
        { id: 'rune-plains', tx: 5, ty: 9, tw: 3, th: 3, trigger: { x: 6, y: 12 }, draw: drawGate },
        { id: 'gatekeepers-forge', tx: 11, ty: 5, tw: 3, th: 3, trigger: { x: 12, y: 8 }, draw: drawForge },
        { id: 'great-library', tx: 19, ty: 9, tw: 3, th: 3, trigger: { x: 20, y: 12 }, draw: drawLibrary },
        { id: 'war-council', tx: 22, ty: 4, tw: 3, th: 3, trigger: { x: 24, y: 7 }, draw: drawTent },
        { id: 'dragons-keep', tx: 26, ty: 0, tw: 5, th: 4, trigger: { x: 28, y: 4 }, draw: drawKeep },
      ];
      for (const lm of this.landmarks) {
        const meta = Game.Meta.regionById(lm.id);
        lm.name = meta ? meta.name : lm.id;
      }
    },

    landmarkAtPixel(px, py) {
      for (const lm of this.landmarks) {
        const x0 = lm.tx * TILE;
        const y0 = lm.ty * TILE;
        if (px >= x0 && px <= x0 + lm.tw * TILE && py >= y0 && py <= y0 + lm.th * TILE + 14) {
          return lm;
        }
      }
      return null;
    },

    inLandmark(x, y, margin) {
      const m = margin | 0;
      return this.landmarks.some(
        (lm) =>
          x >= lm.tx - m && x < lm.tx + lm.tw + m && y >= lm.ty - m && y < lm.ty + lm.th + m
      );
    },

    /* Landmark whose trigger tile the player is standing on. */
    currentTrigger() {
      const tx = Math.floor(this.player.x / TILE);
      const ty = Math.floor((this.player.y - 4) / TILE);
      return (
        this.landmarks.find((lm) => lm.trigger.x === tx && lm.trigger.y === ty) || null
      );
    },

    /* ---------------- map generation ---------------- */

    buildMap() {
      const rng = mulberry32(20260717);
      this.map = new Array(COLS * ROWS);
      this.solidMap = new Array(COLS * ROWS).fill(false);
      this.waterTiles = [];

      // Base grass with variation.
      for (let i = 0; i < COLS * ROWS; i++) {
        const r = rng();
        this.map[i] =
          r < 0.1 ? T.GRASS2 : r < 0.155 ? T.FLOWER : r < 0.195 ? T.FLOWER2 : T.GRASS;
      }

      const set = (x, y, t) => {
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.map[this.idx(x, y)] = t;
      };

      // Water: NW lake, a river flowing east from it into a pond, SE lake.
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 9; x++) {
          const dx = (x - 2) / 4.4;
          const dy = (y - 2) / 3.6;
          if (dx * dx + dy * dy <= 1) set(x, y, T.WATER);
        }
      }
      for (let x = 3; x <= 14; x++) {
        set(x, 2, T.WATER);
        set(x, 3, T.WATER);
      }
      for (let y = 0; y <= 5; y++) {
        for (let x = 12; x <= 16; x++) {
          const dx = (x - 14) / 2.4;
          const dy = (y - 2.5) / 2.2;
          if (dx * dx + dy * dy <= 1) set(x, y, T.WATER);
        }
      }
      for (let y = 13; y < ROWS; y++) {
        for (let x = 26; x < COLS; x++) {
          const dx = (x - 30.5) / 4.0;
          const dy = (y - 16.8) / 3.2;
          if (dx * dx + dy * dy <= 1) set(x, y, T.WATER);
        }
      }

      // The road: L-shaped segments linking the five landmarks.
      const segments = [
        [2, 15, 6, 15],
        [6, 15, 6, 12],
        [6, 12, 12, 12],
        [12, 12, 12, 8],
        [12, 8, 18, 8],
        [18, 8, 18, 12],
        [18, 12, 24, 12],
        [24, 12, 24, 7],
        [24, 7, 28, 7],
        [28, 7, 28, 4],
      ];
      for (const [x0, y0, x1, y1] of segments) {
        const sx = Math.sign(x1 - x0) || 0;
        const sy = Math.sign(y1 - y0) || 0;
        let x = x0;
        let y = y0;
        set(x, y, T.PATH);
        while (x !== x1 || y !== y1) {
          x += sx;
          y += sy;
          set(x, y, T.PATH);
        }
      }

      const isPath = (x, y) => this.tileAt(x, y) === T.PATH;
      const nearPath = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (isPath(x + dx, y + dy)) return true;
          }
        }
        return false;
      };
      const grassy = (x, y) => {
        const t = this.tileAt(x, y);
        return t === T.GRASS || t === T.GRASS2 || t === T.FLOWER || t === T.FLOWER2;
      };

      // Tree border around the map edge.
      for (let x = 0; x < COLS; x++) {
        for (const y of [0, ROWS - 1]) {
          if (grassy(x, y) && !this.inLandmark(x, y, 0)) set(x, y, T.TREE);
        }
      }
      for (let y = 0; y < ROWS; y++) {
        for (const x of [0, COLS - 1]) {
          if (grassy(x, y) && !this.inLandmark(x, y, 0)) set(x, y, T.TREE);
        }
      }

      // Scattered woods, kept off the road, landmarks, and the spawn clearing.
      const spawn = { x: 3, y: 15 };
      let placed = 0;
      for (let tries = 0; tries < 400 && placed < 46; tries++) {
        const x = 1 + Math.floor(rng() * (COLS - 2));
        const y = 1 + Math.floor(rng() * (ROWS - 2));
        if (!grassy(x, y)) continue;
        if (nearPath(x, y)) continue;
        if (this.inLandmark(x, y, 1)) continue;
        if (Math.abs(x - spawn.x) <= 2 && Math.abs(y - spawn.y) <= 2) continue;
        set(x, y, T.TREE);
        placed++;
      }

      // Solidity: water, trees, landmark footprints.
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = this.tileAt(x, y);
          if (t === T.WATER) {
            this.solidMap[this.idx(x, y)] = true;
            this.waterTiles.push({ x, y });
          } else if (t === T.TREE || this.inLandmark(x, y, 0)) {
            this.solidMap[this.idx(x, y)] = true;
          }
        }
      }
    },

    /* Pre-render terrain once; landmarks/water shimmer/player draw per frame. */
    renderBackground() {
      const bg = document.createElement('canvas');
      bg.width = W;
      bg.height = H;
      const c = bg.getContext('2d');
      c.imageSmoothingEnabled = false;

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          c.drawImage(this.atlas, this.tileAt(x, y) * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
        }
      }

      // Shoreline foam where water meets land.
      c.fillStyle = 'rgba(190, 226, 255, 0.35)';
      for (const { x, y } of this.waterTiles) {
        if (this.tileAt(x, y - 1) !== T.WATER) c.fillRect(x * TILE, y * TILE, TILE, 2);
        if (this.tileAt(x, y + 1) !== T.WATER) c.fillRect(x * TILE, y * TILE + TILE - 2, TILE, 2);
        if (this.tileAt(x - 1, y) !== T.WATER) c.fillRect(x * TILE, y * TILE, 2, TILE);
        if (this.tileAt(x + 1, y) !== T.WATER) c.fillRect(x * TILE + TILE - 2, y * TILE, 2, TILE);
      }

      // Soft path edging.
      c.fillStyle = 'rgba(60, 44, 20, 0.25)';
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.tileAt(x, y) !== T.PATH) continue;
          if (this.tileAt(x, y - 1) !== T.PATH) c.fillRect(x * TILE, y * TILE, TILE, 2);
          if (this.tileAt(x, y + 1) !== T.PATH) c.fillRect(x * TILE, y * TILE + TILE - 2, TILE, 2);
        }
      }

      this.bg = bg;
    },

    /* ---------------- input ---------------- */

    bindInput() {
      const MOVE_KEYS = new Set([
        'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
      ]);

      document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (Game.ui.overlayOpen) return; // overlays own the keyboard
        if (MOVE_KEYS.has(k)) {
          this.keys.add(k);
          e.preventDefault();
        } else if (k === 'enter') {
          const lm = this.currentTrigger();
          if (lm && Game.Region) Game.Region.open(lm.id);
        }
      });

      document.addEventListener('keyup', (e) => {
        this.keys.delete(e.key.toLowerCase());
      });

      window.addEventListener('blur', () => this.keys.clear());

      this.canvas.addEventListener('click', (e) => {
        if (Game.ui.overlayOpen) return;
        const p = this.canvasPoint(e);
        const lm = this.landmarkAtPixel(p.x, p.y);
        if (lm && Game.Region) Game.Region.open(lm.id);
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (Game.ui.overlayOpen) {
          this.canvas.style.cursor = 'default';
          return;
        }
        const p = this.canvasPoint(e);
        this.canvas.style.cursor = this.landmarkAtPixel(p.x, p.y) ? 'pointer' : 'default';
      });
    },

    canvasPoint(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * W,
        y: ((e.clientY - r.top) / r.height) * H,
      };
    },

    /* ---------------- update ---------------- */

    update(dt) {
      const p = this.player;
      if (Game.ui.overlayOpen) {
        p.moving = false;
        return;
      }

      const left = this.keys.has('a') || this.keys.has('arrowleft');
      const right = this.keys.has('d') || this.keys.has('arrowright');
      const up = this.keys.has('w') || this.keys.has('arrowup');
      const down = this.keys.has('s') || this.keys.has('arrowdown');

      let dx = (right ? 1 : 0) - (left ? 1 : 0);
      let dy = (down ? 1 : 0) - (up ? 1 : 0);
      p.moving = !!(dx || dy);
      if (dx) p.facing = dx;

      if (p.moving) {
        if (dx && dy) {
          dx *= 0.7071;
          dy *= 0.7071;
        }
        this.tryMove(dx * p.speed * dt, 0);
        this.tryMove(0, dy * p.speed * dt);

        p.frameT += dt;
        if (p.frameT >= 0.16) {
          p.frameT = 0;
          p.frame = p.frame ? 0 : 1;
        }
      } else {
        p.frameT = 0;
        p.frame = 0;
      }
    },

    /* Feet hitbox: 14px wide, 8px tall, bottom at player.y. */
    blockedAt(x, y) {
      const corners = [
        [x - 7, y - 1],
        [x + 7, y - 1],
        [x - 7, y - 8],
        [x + 7, y - 8],
      ];
      return corners.some(([cx, cy]) =>
        this.isSolid(Math.floor(cx / TILE), Math.floor(cy / TILE))
      );
    },

    tryMove(mx, my) {
      const p = this.player;
      const nx = Math.min(W - 8, Math.max(8, p.x + mx));
      const ny = Math.min(H - 2, Math.max(12, p.y + my));
      if (!this.blockedAt(nx, ny)) {
        p.x = nx;
        p.y = ny;
      }
    },

    /* ---------------- render ---------------- */

    render(t) {
      const c = this.ctx;
      c.drawImage(this.bg, 0, 0);
      this.renderWaterShimmer(c, t);

      for (const lm of this.landmarks) {
        const locked = !Game.State.regionUnlocked(lm.id);
        const C = locked ? grayed : (h) => h;
        lm.draw(c, lm.tx * TILE, lm.ty * TILE, lm.tw * TILE, lm.th * TILE, C, t);
        if (locked) this.drawLock(c, lm);
        this.drawLandmarkLabel(c, lm, locked);
      }

      this.drawPlayer(c, t);

      const trig = this.currentTrigger();
      if (trig && !Game.ui.overlayOpen) this.drawPrompt(c, trig);
    },

    renderWaterShimmer(c, t) {
      for (const { x, y } of this.waterTiles) {
        const h = ((x * 73 + y * 151) % 97) / 97;
        const phase = t * 1.2 + h * Math.PI * 2;
        const a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(phase));
        c.globalAlpha = a;
        c.fillStyle = '#bfe3ff';
        const gx = x * TILE + 4 + h * 10 + Math.sin(phase) * 2;
        const gy = y * TILE + 6 + ((h * 53) % 1) * 16;
        c.fillRect(gx, gy, 9, 2);
        c.fillRect(gx + 5, gy + 5, 5, 1);
        c.globalAlpha = 1;
      }
    },

    drawLock(c, lm) {
      const cx = lm.tx * TILE + (lm.tw * TILE) / 2;
      const cy = lm.ty * TILE + (lm.th * TILE) / 2 - 6;
      c.fillStyle = 'rgba(10, 8, 20, 0.55)';
      c.fillRect(cx - 12, cy - 12, 24, 26);
      c.strokeStyle = '#e8c95a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy - 3, 5, Math.PI, 0);
      c.stroke();
      c.fillStyle = '#d4af37';
      c.fillRect(cx - 8, cy - 3, 16, 12);
      c.fillStyle = '#4a3a10';
      c.fillRect(cx - 1, cy + 1, 3, 5);
    },

    drawLandmarkLabel(c, lm, locked) {
      const cx = lm.tx * TILE + (lm.tw * TILE) / 2;
      const by = lm.ty * TILE + lm.th * TILE;
      c.textAlign = 'center';
      c.font = 'bold 11px Georgia, serif';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(8, 6, 16, 0.85)';
      c.strokeText(lm.name, cx, by + 12);
      c.fillStyle = locked ? '#a9a9ad' : '#f0e3c0';
      c.fillText(lm.name, cx, by + 12);
      if (locked) {
        const req = Game.Meta.requirementFor(lm.id);
        const msg = req ? `Sealed — beat ${req} first` : 'Sealed';
        c.font = '9px Georgia, serif';
        c.strokeText(msg, cx, by + 24);
        c.fillStyle = '#e8a0a0';
        c.fillText(msg, cx, by + 24);
      }
      c.textAlign = 'left';
    },

    drawPrompt(c, lm) {
      const unlocked = Game.State.regionUnlocked(lm.id);
      const text = unlocked ? `Enter — ${lm.name}` : 'Enter — Sealed…';
      c.font = 'bold 11px Georgia, serif';
      const w = c.measureText(text).width + 18;
      const px = Math.min(W - w - 4, Math.max(4, this.player.x - w / 2));
      const py = this.player.y - 52;
      c.fillStyle = 'rgba(20, 15, 34, 0.9)';
      c.fillRect(px, py, w, 18);
      c.strokeStyle = '#c9a336';
      c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, w - 1, 17);
      c.fillStyle = '#f0e3c0';
      c.fillText(text, px + 9, py + 13);
    },

    drawPlayer(c, t) {
      const p = this.player;
      const bob = p.moving && p.frame ? 1 : 0;
      const x = Math.round(p.x);
      const y = Math.round(p.y);

      // shadow
      c.fillStyle = 'rgba(0, 0, 0, 0.28)';
      c.beginPath();
      c.ellipse(x, y - 1, 8, 3, 0, 0, Math.PI * 2);
      c.fill();

      c.save();
      c.translate(x, y - bob);
      if (p.facing < 0) c.scale(-1, 1);

      // staff (behind body)
      const staffBob = p.moving && p.frame ? -1 : 0;
      c.fillStyle = '#7a5230';
      c.fillRect(6, -21 + staffBob, 2, 21);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      c.fillStyle = `rgba(127, 227, 255, ${0.25 + 0.25 * pulse})`;
      c.beginPath();
      c.arc(7, -23 + staffBob, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#bfefff';
      c.beginPath();
      c.arc(7, -23 + staffBob, 2.2, 0, Math.PI * 2);
      c.fill();

      // robe (trapezoid) + trim
      c.fillStyle = '#4b3a8f';
      c.beginPath();
      c.moveTo(-7, 0);
      c.lineTo(7, 0);
      c.lineTo(5, -12);
      c.lineTo(-5, -12);
      c.closePath();
      c.fill();
      c.fillStyle = '#d4af37';
      c.fillRect(-7, -1, 14, 1);

      // torso + belt
      c.fillStyle = '#57459e';
      c.fillRect(-5, -18, 10, 7);
      c.fillStyle = '#d4af37';
      c.fillRect(-5, -12, 10, 1);

      // arm holding staff
      c.fillStyle = '#4b3a8f';
      c.fillRect(3, -16, 4, 3);

      // head
      c.fillStyle = '#eecfa4';
      c.fillRect(-4, -25, 8, 7);
      c.fillStyle = '#2a2138';
      c.fillRect(2, -23, 1, 2); // eye, facing side

      // pointed hat
      c.fillStyle = '#332a66';
      c.beginPath();
      c.moveTo(-6, -26);
      c.lineTo(6, -26);
      c.lineTo(1, -36);
      c.closePath();
      c.fill();
      c.fillRect(-7, -27, 14, 2); // brim
      c.fillStyle = '#d4af37';
      c.fillRect(-5, -27, 10, 1); // band

      c.restore();
    },
  };

  /* ---------------- landmark drawings (layered rects, palette C for lock) -------- */

  function drawGate(c, x, y, w, h, C, t) {
    // Two mossy stone pillars with an arch and a hanging rune banner.
    const px = 12; // pillar width
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + 4, y + h - 5, w - 8, 5);

    for (const ox of [4, w - 4 - px]) {
      c.fillStyle = C('#8f8f9a');
      c.fillRect(x + ox, y + 14, px, h - 16);
      c.fillStyle = C('#6f6f7c');
      c.fillRect(x + ox, y + 14, 3, h - 16); // shading
      c.fillStyle = C('#a8a8b2');
      c.fillRect(x + ox, y + 12, px, 4); // capstone
      c.fillStyle = C('#55704a'); // moss
      c.fillRect(x + ox + 2, y + h - 8, 5, 3);
    }
    // arch
    c.fillStyle = C('#8f8f9a');
    c.fillRect(x + 2, y + 6, w - 4, 8);
    c.fillStyle = C('#a8a8b2');
    c.fillRect(x + 2, y + 6, w - 4, 3);
    // stone seams
    c.fillStyle = C('#5f5f6b');
    for (let i = 0; i < 3; i++) {
      c.fillRect(x + 6, y + 24 + i * 14, 8, 1);
      c.fillRect(x + w - 14, y + 30 + i * 14, 8, 1);
    }
    // rune banner
    c.fillStyle = C('#3f5fae');
    c.fillRect(x + w / 2 - 8, y + 14, 16, 26);
    c.beginPath();
    c.moveTo(x + w / 2 - 8, y + 40);
    c.lineTo(x + w / 2, y + 46);
    c.lineTo(x + w / 2 + 8, y + 40);
    c.closePath();
    c.fill();
    c.strokeStyle = C('#e8e2c8');
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + w / 2 - 3, y + 20);
    c.lineTo(x + w / 2 + 3, y + 24);
    c.lineTo(x + w / 2 - 3, y + 28);
    c.lineTo(x + w / 2 + 3, y + 32);
    c.stroke();
  }

  function drawForge(c, x, y, w, h, C, t) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + 2, y + h - 5, w - 4, 5);
    // stone hut
    c.fillStyle = C('#7b7480');
    c.fillRect(x + 6, y + 30, w - 12, h - 32);
    c.fillStyle = C('#635d68');
    c.fillRect(x + 6, y + 30, 4, h - 32);
    // roof
    c.fillStyle = C('#463f4d');
    c.beginPath();
    c.moveTo(x, y + 32);
    c.lineTo(x + w / 2, y + 12);
    c.lineTo(x + w, y + 32);
    c.closePath();
    c.fill();
    c.fillStyle = C('#57505f');
    c.fillRect(x + 2, y + 30, w - 4, 3);
    // chimney + smoke
    c.fillStyle = C('#5a545f');
    c.fillRect(x + w - 24, y + 6, 9, 18);
    const s = (t * 8) % 22;
    c.fillStyle = `rgba(200, 200, 205, ${0.35 - s * 0.013})`;
    c.beginPath();
    c.arc(x + w - 19, y + 2 - s, 3 + s * 0.18, 0, Math.PI * 2);
    c.fill();
    // doorway with forge-fire glow
    c.fillStyle = C('#241f28');
    c.fillRect(x + w / 2 - 8, y + h - 24, 16, 22);
    const glow = 0.45 + 0.3 * Math.sin(t * 5);
    c.fillStyle = C('#ff8c3a');
    c.globalAlpha = glow;
    c.fillRect(x + w / 2 - 5, y + h - 14, 10, 12);
    c.globalAlpha = 1;
    // anvil
    c.fillStyle = C('#2e2b33');
    c.fillRect(x + 8, y + h - 12, 12, 4);
    c.fillRect(x + 12, y + h - 8, 4, 6);
  }

  function drawLibrary(c, x, y, w, h, C, t) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + 2, y + h - 5, w - 4, 5);
    // main hall
    c.fillStyle = C('#cabb92');
    c.fillRect(x + 4, y + 26, w - 8, h - 28);
    // steps
    c.fillStyle = C('#a99a76');
    c.fillRect(x + 8, y + h - 6, w - 16, 6);
    // pediment
    c.fillStyle = C('#8a765a');
    c.beginPath();
    c.moveTo(x, y + 28);
    c.lineTo(x + w / 2, y + 8);
    c.lineTo(x + w, y + 28);
    c.closePath();
    c.fill();
    c.fillStyle = C('#9d8968');
    c.beginPath();
    c.moveTo(x + 8, y + 27);
    c.lineTo(x + w / 2, y + 12);
    c.lineTo(x + w - 8, y + 27);
    c.closePath();
    c.fill();
    // columns
    c.fillStyle = C('#e0d4ac');
    for (const ox of [8, 24, w - 30, w - 14]) {
      c.fillRect(x + ox, y + 30, 6, h - 38);
      c.fillStyle = C('#b8a986');
      c.fillRect(x + ox + 4, y + 30, 2, h - 38);
      c.fillStyle = C('#e0d4ac');
    }
    // arched door
    c.fillStyle = C('#39598f');
    c.fillRect(x + w / 2 - 7, y + h - 24, 14, 20);
    c.beginPath();
    c.arc(x + w / 2, y + h - 24, 7, Math.PI, 0);
    c.fill();
    // open-book emblem on the pediment
    c.fillStyle = C('#f4eede');
    c.fillRect(x + w / 2 - 6, y + 18, 5, 4);
    c.fillRect(x + w / 2 + 1, y + 18, 5, 4);
    c.fillStyle = C('#8a765a');
    c.fillRect(x + w / 2, y + 17, 1, 6);
  }

  function drawTent(c, x, y, w, h, C, t) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + 4, y + h - 5, w - 8, 5);
    // banner pole + waving pennant
    c.fillStyle = C('#6b4e2c');
    c.fillRect(x + w / 2 - 1, y + 2, 2, 22);
    const wave = Math.sin(t * 4) * 2;
    c.fillStyle = C('#e0b13c');
    c.beginPath();
    c.moveTo(x + w / 2 + 1, y + 3);
    c.lineTo(x + w / 2 + 16 + wave, y + 7);
    c.lineTo(x + w / 2 + 1, y + 11);
    c.closePath();
    c.fill();
    // tent body
    c.fillStyle = C('#8c3a3a');
    c.beginPath();
    c.moveTo(x + 4, y + h - 4);
    c.lineTo(x + w / 2, y + 18);
    c.lineTo(x + w - 4, y + h - 4);
    c.closePath();
    c.fill();
    // stripes
    c.fillStyle = C('#a94f4f');
    c.beginPath();
    c.moveTo(x + w / 2, y + 18);
    c.lineTo(x + w / 2 - 8, y + h - 4);
    c.lineTo(x + w / 2 - 16, y + h - 4);
    c.closePath();
    c.fill();
    // opening
    c.fillStyle = C('#3a1c1c');
    c.beginPath();
    c.moveTo(x + w / 2 - 6, y + h - 4);
    c.lineTo(x + w / 2, y + h - 22);
    c.lineTo(x + w / 2 + 6, y + h - 4);
    c.closePath();
    c.fill();
    // shield prop
    c.fillStyle = C('#5b6c8f');
    c.beginPath();
    c.arc(x + 14, y + h - 12, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C('#d4af37');
    c.beginPath();
    c.arc(x + 14, y + h - 12, 3, 0, Math.PI * 2);
    c.fill();
  }

  function drawKeep(c, x, y, w, h, C, t) {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(x + 2, y + h - 5, w - 4, 5);
    // curtain wall
    c.fillStyle = C('#332c3d');
    c.fillRect(x + 10, y + 44, w - 20, h - 46);
    // battlements on the wall
    c.fillStyle = C('#3d3450');
    for (let i = 0; i < 6; i++) c.fillRect(x + 14 + i * 20, y + 38, 10, 8);
    // twin towers
    for (const ox of [2, w - 34]) {
      c.fillStyle = C('#3d3450');
      c.fillRect(x + ox, y + 18, 32, h - 20);
      c.fillStyle = C('#2b2438');
      c.fillRect(x + ox, y + 18, 6, h - 20);
      // spire
      c.fillStyle = C('#221c2e');
      c.beginPath();
      c.moveTo(x + ox - 3, y + 20);
      c.lineTo(x + ox + 16, y + 2);
      c.lineTo(x + ox + 35, y + 20);
      c.closePath();
      c.fill();
      // glowing red window
      const gl = 0.5 + 0.35 * Math.sin(t * 2 + ox);
      c.globalAlpha = gl;
      c.fillStyle = C('#e04a3a');
      c.fillRect(x + ox + 12, y + 30, 8, 12);
      c.globalAlpha = 1;
      c.fillStyle = C('#c23b3b');
      c.fillRect(x + ox + 14, y + 33, 4, 6);
    }
    // central gate with portcullis
    c.fillStyle = C('#191423');
    c.fillRect(x + w / 2 - 14, y + h - 34, 28, 32);
    c.beginPath();
    c.arc(x + w / 2, y + h - 34, 14, Math.PI, 0);
    c.fill();
    c.strokeStyle = C('#4d4360');
    c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(x + w / 2 + i * 8, y + h - 44);
      c.lineTo(x + w / 2 + i * 8, y + h - 2);
      c.stroke();
    }
    // purple banner
    c.fillStyle = C('#5a3b7a');
    c.fillRect(x + w / 2 - 4, y + 46, 8, 16);
    c.beginPath();
    c.moveTo(x + w / 2 - 4, y + 62);
    c.lineTo(x + w / 2, y + 67);
    c.lineTo(x + w / 2 + 4, y + 62);
    c.closePath();
    c.fill();
  }

  Game.World = World;
})();
