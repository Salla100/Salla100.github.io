/* orbit.js — Full-background retro orbital visualisation
   Fills the entire hero section. Objects orbit Earth and can be
   clicked to navigate (handled on the parent wrapper so pointer-
   events:none on the canvas doesn't block text interaction). */
(function () {
  'use strict';

  const canvas = document.getElementById('orbit-canvas');
  if (!canvas) return;
  const ctx   = canvas.getContext('2d');
  const wrap  = canvas.closest('.hero-wrapper') || canvas.parentElement;

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Live canvas dimensions (updated on resize)
  let W, H, CX, CY, EARTH_R;

  function setupCanvas() {
    // Use viewport dimensions — most reliable since the canvas covers 100vh/100vw.
    // CSS inset:0 controls the display size; we only set the pixel buffer here.
    W  = window.innerWidth;
    H  = window.innerHeight;
    CX = W / 2;
    CY = H / 2;
    EARTH_R = Math.min(W, H) * 0.042;

    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // ── Orbital object definitions ─────────────────────────────────────
  // rx_f: semi-major axis as fraction of W/2
  // ry_f: semi-minor axis as fraction of min(W,H)/2  (controls tilt look)
  // rot: 2-D rotation of the orbit ellipse (rad)
  // period: animation period in seconds
  // link: navigation target or null
  const DEFS = [
    // Inner fast orbit — saxophone (→ blog)
    { id: 'sax',   shape: 'saxophone', col: '#f0a030',
      rx_f: 0.18, ry_f: 0.20, rot:  1.30, period: 20, phase: 3.5, link: 'blog.html' },
    // OPS-SAT — satellite (no link)
    { id: 'ops',   shape: 'satellite', col: '#4f8aff',
      rx_f: 0.25, ry_f: 0.15, rot:  0.35, period: 27, phase: 0,   link: null },
    // Phone — links to contact section
    { id: 'phone', shape: 'phone',     col: '#e8edf8',
      rx_f: 0.28, ry_f: 0.07, rot:  0.15, period: 32, phase: 1.4, link: '#contact' },
    // Sentinel-1A — satellite
    { id: 'sen1',  shape: 'satellite', col: '#7c5cfc',
      rx_f: 0.33, ry_f: 0.22, rot: -0.50, period: 38, phase: 2.1, link: null },
    // Gameboy
    { id: 'gb',    shape: 'gameboy',   col: '#a8b4c8',
      rx_f: 0.38, ry_f: 0.28, rot: -1.10, period: 46, phase: 0.7, link: null },
    // Sentinel-2A — satellite
    { id: 'sen2',  shape: 'satellite', col: '#00d4aa',
      rx_f: 0.41, ry_f: 0.18, rot:  0.88, period: 53, phase: 4.2, link: null },
    // PCB — links to projects
    { id: 'pcb',   shape: 'pcb',       col: '#00cc66',
      rx_f: 0.44, ry_f: 0.11, rot: -0.72, period: 61, phase: 1.0, link: 'projects.html' },
    // R2-D2 — outermost
    { id: 'r2d2',  shape: 'r2d2',      col: '#ddeeff',
      rx_f: 0.48, ry_f: 0.32, rot:  1.80, period: 72, phase: 5.5, link: null },
  ];

  // ── Math ────────────────────────────────────────────────────────────
  function orbital(def, t) {
    const S  = Math.min(W, H) / 2;
    const rx = def.rx_f * (W / 2);
    const ry = def.ry_f * S;
    const theta = (t / def.period) * Math.PI * 2 + def.phase;
    const cosR = Math.cos(def.rot), sinR = Math.sin(def.rot);
    const ex   = rx * Math.cos(theta);
    const ey   = ry * Math.sin(theta);
    return { x: CX + ex * cosR - ey * sinR,
             y: CY + ex * sinR + ey * cosR,
             theta, rx, ry };
  }

  function isFront(theta) { return Math.sin(theta) >= 0; }

  // ── Drawing: orbit ring ─────────────────────────────────────────────
  function drawOrbitRing(def) {
    const S  = Math.min(W, H) / 2;
    const rx = def.rx_f * (W / 2);
    const ry = def.ry_f * S;
    const cosR = Math.cos(def.rot), sinR = Math.sin(def.rot);
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.lineWidth   = 0.7;
    ctx.strokeStyle = def.col + '22';
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      const ex    = rx * Math.cos(theta);
      const ey    = ry * Math.sin(theta);
      const px    = CX + ex * cosR - ey * sinR;
      const py    = CY + ex * sinR + ey * cosR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Drawing: Earth ──────────────────────────────────────────────────
  function drawEarth() {
    // Atmosphere bloom
    const atm = ctx.createRadialGradient(CX, CY, EARTH_R * 0.8, CX, CY, EARTH_R * 2.8);
    atm.addColorStop(0,   'rgba(40,110,255,0.22)');
    atm.addColorStop(0.4, 'rgba(20,70,200,0.07)');
    atm.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = atm;
    ctx.fill();

    // Planet body
    const body = ctx.createRadialGradient(
      CX - EARTH_R * 0.3, CY - EARTH_R * 0.3, EARTH_R * 0.06,
      CX, CY, EARTH_R);
    body.addColorStop(0,   '#4a90e8');
    body.addColorStop(0.5, '#1c3f99');
    body.addColorStop(1,   '#060d2c');
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // Latitude grid lines (clipped to Earth disk)
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,180,255,0.18)';
    ctx.lineWidth   = 0.5;
    for (let lat = -60; lat <= 60; lat += 30) {
      const cos = Math.cos(lat * Math.PI / 180);
      const sin = Math.sin(lat * Math.PI / 180);
      const ry2 = EARTH_R * cos * 0.28;
      const yOff = EARTH_R * sin;
      if (ry2 > 1) {
        ctx.beginPath();
        ctx.ellipse(CX, CY + yOff, EARTH_R * cos, ry2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Atmosphere ring
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.40)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R + 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.10)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
  }

  // ── Shape helpers ───────────────────────────────────────────────────
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── Individual shapes ───────────────────────────────────────────────
  function drawSatellite(x, y, r, col) {
    // Diamond body + solar panels
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.55, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.55, y);
    ctx.closePath();
    ctx.fill();
    // Panels
    ctx.fillStyle = col + 'a0';
    ctx.fillRect(x - r * 2.1, y - r * 0.18, r * 1.35, r * 0.36);
    ctx.fillRect(x + r * 0.75, y - r * 0.18, r * 1.35, r * 0.36);
    // Panel lines
    ctx.strokeStyle = col + '50';
    ctx.lineWidth = 0.6;
    [x - r * 2.1 + r * 0.45, x - r * 2.1 + r * 0.90].forEach(px => {
      ctx.beginPath(); ctx.moveTo(px, y - r*0.18); ctx.lineTo(px, y + r*0.18); ctx.stroke();
    });
    [x + r * 0.75 + r * 0.45, x + r * 0.75 + r * 0.90].forEach(px => {
      ctx.beginPath(); ctx.moveTo(px, y - r*0.18); ctx.lineTo(px, y + r*0.18); ctx.stroke();
    });
  }

  function drawSaxophone(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.24;

    // Neck + body curve (J-shape)
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, -r * 1.15);      // top of neck
    ctx.lineTo(-r * 0.05, r * 0.25);        // straight down
    ctx.bezierCurveTo(                        // curve to bell
      -r * 0.05, r * 0.85,
       r * 0.85, r * 0.85,
       r * 0.85, r * 0.10);
    ctx.stroke();

    // Bell arc
    ctx.beginPath();
    ctx.arc(r * 0.85, r * 0.10, r * 0.38, 0.25 * Math.PI, 1.55 * Math.PI, true);
    ctx.stroke();

    // Mouthpiece bar
    ctx.lineWidth = r * 0.32;
    ctx.beginPath();
    ctx.moveTo(-r * 0.36, -r * 1.15);
    ctx.lineTo(r * 0.26, -r * 1.15);
    ctx.stroke();

    // Keys (small circles)
    ctx.fillStyle = col;
    [[-r * 0.28, -r * 0.3], [-r * 0.28, r * 0.1]].forEach(([kx, ky]) => {
      ctx.beginPath();
      ctx.arc(kx, ky, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawGameboy(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);

    const bw = r * 1.7, bh = r * 2.1, br = r * 0.30;

    // Body
    rrect(-bw/2, -bh/2, bw, bh, br);
    ctx.fillStyle = col;
    ctx.fill();

    // Screen bezel
    const sw = bw * 0.72, sh = bh * 0.36;
    const sx = -sw / 2, sy = -bh/2 + bh * 0.09;
    ctx.fillStyle = '#1e2a1e';
    ctx.fillRect(sx, sy, sw, sh);
    // Screen glow
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(sx + 2, sy + 2, sw - 4, sh - 4);
    // Screen scanlines hint
    ctx.fillStyle = 'rgba(0,255,60,0.07)';
    for (let li = 0; li < sh - 4; li += 3) ctx.fillRect(sx + 2, sy + 2 + li, sw - 4, 1);

    // GAME BOY text area (thin bar below screen)
    ctx.fillStyle = '#888fa0';
    ctx.font = `bold ${r * 0.22}px DM Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME BOY', 0, sy + sh + r * 0.22);

    // D-pad
    const dp = r * 0.14;
    const dcx = -bw/2 + bw * 0.28;
    const dcy =  bh/2 - bh * 0.31;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(dcx - dp * 3, dcy - dp, dp * 6, dp * 2); // horizontal
    ctx.fillRect(dcx - dp, dcy - dp * 3, dp * 2, dp * 6); // vertical

    // A/B buttons
    const bcx = bw/2 - bw * 0.28, bcy = bh/2 - bh * 0.31;
    [['#cc2233', r * 0.22, r * 0.06], ['#2244cc', -r * 0.22, -r * 0.06]].forEach(([bc, ox, oy]) => {
      ctx.fillStyle = bc;
      ctx.beginPath();
      ctx.arc(bcx + ox, bcy + oy, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    });

    // Start/Select
    [-r * 0.17, r * 0.17].forEach(ox => {
      ctx.fillStyle = '#555';
      rrect(ox - r * 0.14, bcy + r * 0.55, r * 0.28, r * 0.11, r * 0.055);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawPhone(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);

    const pw = r * 1.25, ph = r * 2.1, pr = r * 0.28;

    // Body
    rrect(-pw/2, -ph/2, pw, ph, pr);
    ctx.fillStyle = col + 'cc';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Screen
    ctx.fillStyle = '#06080f';
    ctx.fillRect(-pw/2 + 2.5, -ph/2 + ph * 0.10, pw - 5, ph * 0.74);

    // Notch / front camera dot
    ctx.fillStyle = col + '80';
    ctx.beginPath();
    ctx.arc(0, -ph/2 + ph * 0.055, r * 0.11, 0, Math.PI * 2);
    ctx.fill();

    // Side buttons (volume strip)
    ctx.fillStyle = col;
    ctx.fillRect(-pw/2 - 1.5, -ph * 0.12, 2, ph * 0.16);
    ctx.fillRect( pw/2 - 0.5, -ph * 0.06, 2, ph * 0.10);

    // Home bar at bottom
    ctx.fillStyle = col + '80';
    rrect(-r * 0.3, ph/2 - ph * 0.07, r * 0.6, r * 0.09, r * 0.045);
    ctx.fill();

    ctx.restore();
  }

  function drawR2D2(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);

    const bw = r * 1.45, bh = r * 1.15, br = r * 0.22;
    const domeR = bw * 0.5;

    // Body
    rrect(-bw/2, -r * 0.12, bw, bh, br);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#4f8aff';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Blue centre stripe on body
    ctx.fillStyle = '#3366dd';
    ctx.fillRect(-r * 0.17, -r * 0.12, r * 0.34, bh);

    // Body panel accents
    ctx.fillStyle = 'rgba(79,138,255,0.25)';
    ctx.fillRect(-bw/2 + r * 0.12, r * 0.12, r * 0.28, r * 0.44);
    ctx.fillRect( bw/2 - r * 0.40, r * 0.12, r * 0.28, r * 0.44);

    // Dome (semicircle head)
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, domeR, -Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4f8aff';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Main eye (blue)
    ctx.fillStyle = '#4f8aff';
    ctx.beginPath();
    ctx.arc(-r * 0.23, -r * 0.40, r * 0.20, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#000010';
    ctx.beginPath();
    ctx.arc(-r * 0.23, -r * 0.40, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.beginPath();
    ctx.arc(-r * 0.26, -r * 0.44, r * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // Dome detail circles
    [r * 0.12, r * 0.42].forEach(ox => {
      ctx.fillStyle = '#aabbd0';
      ctx.beginPath();
      ctx.arc(ox, -r * 0.42, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });

    // Feet
    [-bw * 0.30, bw * 0.30].forEach(fx => {
      ctx.fillStyle = col;
      ctx.fillRect(fx - r * 0.13, -r * 0.12 + bh, r * 0.26, r * 0.36);
    });

    ctx.restore();
  }

  function drawPCB(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);
    const w = r * 2.0, h = r * 1.3;
    ctx.fillStyle = col + '18';
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.9;
    rrect(-w/2, -h/2, w, h, r * 0.12);
    ctx.fill();
    ctx.stroke();
    // Trace L
    ctx.beginPath();
    ctx.moveTo(-w*0.35, -h/2);
    ctx.lineTo(-w*0.35, -h*0.12);
    ctx.lineTo(w*0.05, -h*0.12);
    ctx.stroke();
    // Via
    ctx.beginPath();
    ctx.arc(-w*0.15, h*0.05, r*0.20, 0, Math.PI*2);
    ctx.stroke();
    // IC
    ctx.fillStyle = col + '35';
    rrect(w*0.06, -h*0.30, w*0.36, h*0.56, r*0.06);
    ctx.fill();
    ctx.stroke();
    // Pins
    for (let i = 0; i < 3; i++) {
      const px = w*0.06 + (w*0.36/4)*(i+0.5);
      ctx.beginPath();
      ctx.moveTo(px, -h*0.30);
      ctx.lineTo(px, -h*0.46);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Object dispatcher ────────────────────────────────────────────────
  function drawObject(def, pos, isHovered) {
    const r = 9; // base drawing radius
    ctx.save();
    if (isHovered) { ctx.shadowColor = def.col; ctx.shadowBlur = 18; }

    switch (def.shape) {
      case 'satellite': drawSatellite(pos.x, pos.y, r, def.col); break;
      case 'saxophone': drawSaxophone(pos.x, pos.y, r, def.col); break;
      case 'gameboy':   drawGameboy(pos.x, pos.y, r, def.col);   break;
      case 'phone':     drawPhone(pos.x, pos.y, r, def.col);     break;
      case 'r2d2':      drawR2D2(pos.x, pos.y, r, def.col);      break;
      case 'pcb':       drawPCB(pos.x, pos.y, r, def.col);       break;
    }

    ctx.restore();

    // Tooltip on hover
    if (isHovered && def.link) {
      const label = {
        'blog.html': 'Blog →',
        'projects.html': 'Projects →',
        '#contact': 'Contact →',
      }[def.link] || def.label;

      ctx.save();
      ctx.font = '11px DM Mono, monospace';
      const tw  = ctx.measureText(label).width;
      const pad = 8;
      const lw  = tw + pad * 2, lh = 18;
      const lx  = Math.max(4, Math.min(pos.x - lw/2, W - lw - 4));
      const ly  = pos.y - 22;

      ctx.fillStyle   = 'rgba(6,8,20,0.92)';
      ctx.strokeStyle = def.col + '60';
      ctx.lineWidth   = 0.6;
      rrect(lx, ly - lh/2, lw, lh, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle    = def.col;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + pad, ly);
      ctx.restore();
    }
  }

  // ── Interaction (via parent wrapper, not canvas) ──────────────────────
  let hovered  = null;
  const curPos = {}; // id → {x,y}

  function hitTest(mx, my) {
    for (let i = DEFS.length - 1; i >= 0; i--) {
      const def = DEFS[i];
      const p   = curPos[def.id];
      if (!p) continue;
      const dx = mx - p.x, dy = my - p.y;
      if (dx*dx + dy*dy < 24*24) return def;
    }
    return null;
  }

  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    hovered = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hovered && hovered.link) wrap.style.cursor = 'pointer';
    else if (wrap.style.cursor === 'pointer') wrap.style.cursor = '';
  });

  wrap.addEventListener('click', e => {
    if (e.target.closest('a, button')) return; // don't hijack real links
    if (hovered && hovered.link) {
      if (hovered.link.startsWith('#')) {
        document.querySelector(hovered.link)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = hovered.link;
      }
    }
  });

  // ── Render loop ──────────────────────────────────────────────────────
  let startTime = null;

  function render(ts) {
    if (!startTime) startTime = ts;
    const t = (ts - startTime) / 1000;

    ctx.clearRect(0, 0, W, H);

    // 1. Orbit rings (all, very faint dashed)
    DEFS.forEach(def => drawOrbitRing(def));

    // 2. Back-half objects at reduced opacity
    ctx.save();
    ctx.globalAlpha = 0.28;
    DEFS.forEach(def => {
      const pos = orbital(def, t);
      curPos[def.id] = pos;
      if (!isFront(pos.theta)) drawObject(def, pos, false);
    });
    ctx.restore();

    // 3. Earth (covers objects passing behind it)
    drawEarth();

    // 4. Front-half objects at full opacity
    DEFS.forEach(def => {
      const pos = curPos[def.id];
      if (isFront(pos.theta)) drawObject(def, pos, hovered === def);
    });

    requestAnimationFrame(render);
  }

  // ── Init & resize ────────────────────────────────────────────────────
  setupCanvas();
  requestAnimationFrame(render);

  window.addEventListener('resize', () => {
    setupCanvas();
  });
})();
