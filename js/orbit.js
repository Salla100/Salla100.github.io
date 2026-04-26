/* orbit.js — Retro orbital visualisation for homepage hero
   Simulates ESA satellites + fun objects orbiting Earth.
   Click interactive objects to navigate to site sections. */
(function () {
  'use strict';

  const canvas = document.getElementById('orbit-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ── HiDPI setup ──────────────────────────────────────────────────────
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const CSS = 340; // display size in CSS px (square)
  canvas.style.width  = CSS + 'px';
  canvas.style.height = CSS + 'px';
  canvas.width  = CSS * DPR;
  canvas.height = CSS * DPR;
  ctx.scale(DPR, DPR);

  const CX = CSS / 2;
  const CY = CSS / 2;
  const EARTH_R = CSS * 0.098; // ~33px

  // ── Orbital objects ──────────────────────────────────────────────────
  // rx/ry: semi-axes of the projected ellipse (canvas px)
  // rot:   2D rotation of the orbit plane (radians)
  // period: animation period (seconds per full orbit)
  // phase:  initial angle offset (radians)
  // link:   click target URL (null = info only)
  const OBJECTS = [
    {
      id: 'blog',
      label: 'Blog →',
      shape: 'note',
      col: '#ff7eb3',
      rx: CSS * 0.185, ry: CSS * 0.062,
      rot: 1.25, period: 17, phase: 3.5,
      link: 'blog.html',
    },
    {
      id: 'opssat',
      label: 'OPS-SAT · ESA',
      shape: 'satellite',
      col: '#4f8aff',
      rx: CSS * 0.245, ry: CSS * 0.072,
      rot: 0.35, period: 24, phase: 0,
      link: null,
    },
    {
      id: 'sentinel1',
      label: 'Sentinel-1A · ESA',
      shape: 'satellite',
      col: '#7c5cfc',
      rx: CSS * 0.305, ry: CSS * 0.098,
      rot: -0.45, period: 31, phase: 2.1,
      link: null,
    },
    {
      id: 'sentinel2',
      label: 'Sentinel-2A · ESA',
      shape: 'satellite',
      col: '#00d4aa',
      rx: CSS * 0.370, ry: CSS * 0.140,
      rot: 0.88, period: 38, phase: 4.2,
      link: null,
    },
    {
      id: 'pcb',
      label: 'Projects →',
      shape: 'pcb',
      col: '#00cc66',
      rx: CSS * 0.435, ry: CSS * 0.100,
      rot: -0.70, period: 52, phase: 1.0,
      link: 'projects.html',
    },
  ];

  // ── Math helpers ──────────────────────────────────────────────────────
  function getPos(obj, t) {
    const theta = (t / obj.period) * Math.PI * 2 + obj.phase;
    const cosR = Math.cos(obj.rot);
    const sinR = Math.sin(obj.rot);
    const ex   = obj.rx * Math.cos(theta);
    const ey   = obj.ry * Math.sin(theta);
    return {
      x:     CX + ex * cosR - ey * sinR,
      y:     CY + ex * sinR + ey * cosR,
      theta,
    };
  }

  // sin(theta) >= 0 → front half of orbit (nearer to viewer)
  function isFront(theta) { return Math.sin(theta) >= 0; }

  // ── Drawing: orbit rings ──────────────────────────────────────────────
  function drawOrbit(obj) {
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = obj.col + '28';
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2;
      const cosR = Math.cos(obj.rot);
      const sinR = Math.sin(obj.rot);
      const ex   = obj.rx * Math.cos(theta);
      const ey   = obj.ry * Math.sin(theta);
      const px   = CX + ex * cosR - ey * sinR;
      const py   = CY + ex * sinR + ey * cosR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Drawing: Earth ────────────────────────────────────────────────────
  function drawEarth() {
    // Outer atmosphere glow
    const atm = ctx.createRadialGradient(CX, CY, EARTH_R * 0.85, CX, CY, EARTH_R * 2.6);
    atm.addColorStop(0,   'rgba(50,120,255,0.20)');
    atm.addColorStop(0.4, 'rgba(20,70,200,0.06)');
    atm.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R * 2.6, 0, Math.PI * 2);
    ctx.fillStyle = atm;
    ctx.fill();

    // Earth body gradient
    const body = ctx.createRadialGradient(
      CX - EARTH_R * 0.32, CY - EARTH_R * 0.32, EARTH_R * 0.06,
      CX, CY, EARTH_R
    );
    body.addColorStop(0,   '#4488ee');
    body.addColorStop(0.5, '#1b3e96');
    body.addColorStop(1,   '#060e2c');
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
      const cosLat = Math.cos(lat * Math.PI / 180);
      const sinLat = Math.sin(lat * Math.PI / 180);
      const rx2    = EARTH_R * cosLat;
      const yOff   = EARTH_R * sinLat;
      const ry2    = rx2 * 0.28; // perspective flatten
      if (rx2 > 1) {
        ctx.beginPath();
        ctx.ellipse(CX, CY + yOff, rx2, ry2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Atmosphere halo ring
    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.38)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CX, CY, EARTH_R + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.09)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
  }

  // ── Drawing: satellite shape (diamond + solar panels) ────────────────
  function drawSatellite(x, y, r, col, glow) {
    ctx.save();
    ctx.translate(x, y);
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 14; }

    // Main body (diamond)
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.55, 0);
    ctx.lineTo(0,  r);
    ctx.lineTo(-r * 0.55, 0);
    ctx.closePath();
    ctx.fill();

    // Solar panels
    ctx.fillStyle = col + 'a0';
    ctx.fillRect(-r * 2.1, -r * 0.18, r * 1.35, r * 0.36);
    ctx.fillRect( r * 0.75, -r * 0.18, r * 1.35, r * 0.36);

    // Panel divider lines
    ctx.strokeStyle = col + '55';
    ctx.lineWidth   = 0.6;
    [-r * 2.1 + r * 0.45, -r * 2.1 + r * 0.90].forEach(px => {
      ctx.beginPath();
      ctx.moveTo(px, -r * 0.18);
      ctx.lineTo(px,  r * 0.18);
      ctx.stroke();
    });
    [r * 0.75 + r * 0.45, r * 0.75 + r * 0.90].forEach(px => {
      ctx.beginPath();
      ctx.moveTo(px, -r * 0.18);
      ctx.lineTo(px,  r * 0.18);
      ctx.stroke();
    });

    ctx.restore();
  }

  // ── Drawing: PCB shape ───────────────────────────────────────────────
  function drawPCB(x, y, r, col, glow) {
    ctx.save();
    ctx.translate(x, y);
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 14; }

    const w = r * 2.0, h = r * 1.3;

    // Board fill + outline
    ctx.fillStyle   = col + '18';
    ctx.strokeStyle = col;
    ctx.lineWidth   = 0.9;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Circuit trace (L-shape)
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -h / 2);
    ctx.lineTo(-w * 0.35, -h * 0.12);
    ctx.lineTo( w * 0.05, -h * 0.12);
    ctx.stroke();

    // IC chip square
    ctx.fillStyle = col + '35';
    ctx.fillRect(w * 0.05, -h * 0.28, w * 0.38, h * 0.56);
    ctx.strokeRect(w * 0.05, -h * 0.28, w * 0.38, h * 0.56);

    // Via circle
    ctx.beginPath();
    ctx.arc(-w * 0.15, h * 0.05, r * 0.20, 0, Math.PI * 2);
    ctx.stroke();

    // Chip pins (top)
    for (let i = 0; i < 3; i++) {
      const px = w * 0.05 + (w * 0.38 / 4) * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(px, -h * 0.28);
      ctx.lineTo(px, -h * 0.43);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Drawing: music note shape ────────────────────────────────────────
  function drawNote(x, y, r, col, glow) {
    ctx.save();
    ctx.translate(x, y);
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
    ctx.fillStyle       = col;
    ctx.font            = `bold ${r * 2.3}px serif`;
    ctx.textAlign       = 'center';
    ctx.textBaseline    = 'middle';
    ctx.fillText('♪', 0, 0);
    ctx.restore();
  }

  // ── Drawing: tooltip label ───────────────────────────────────────────
  function drawLabel(label, x, y, col) {
    ctx.save();
    ctx.font = '10px DM Mono, monospace';
    const tw  = ctx.measureText(label).width;
    const pad = 7;
    const lw  = tw + pad * 2;
    const lh  = 16;
    const lx  = Math.min(Math.max(x - lw / 2, 4), CSS - lw - 4);
    const ly  = y - 22;

    // Background
    ctx.fillStyle   = 'rgba(6,8,20,0.92)';
    ctx.strokeStyle = col + '55';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.rect(lx, ly - lh / 2, lw, lh);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle    = col;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + pad, ly);
    ctx.restore();
  }

  // ── Drawing: dispatch by shape ───────────────────────────────────────
  function drawObject(obj, pos, isHovered) {
    const r = 6;
    const alpha = isHovered ? 1.0 : 0.92;
    ctx.save();
    ctx.globalAlpha = alpha;

    switch (obj.shape) {
      case 'satellite': drawSatellite(pos.x, pos.y, r, obj.col, isHovered); break;
      case 'pcb':       drawPCB(pos.x, pos.y, r, obj.col, isHovered);       break;
      case 'note':      drawNote(pos.x, pos.y, r, obj.col, isHovered);      break;
    }

    ctx.restore();

    if (isHovered) drawLabel(obj.label, pos.x, pos.y, obj.col);
  }

  // ── Interaction ───────────────────────────────────────────────────────
  let hovered    = null;
  const curPos   = {}; // id → {x, y}

  function hitTest(mx, my) {
    // Test in reverse order (topmost drawn first)
    for (let i = OBJECTS.length - 1; i >= 0; i--) {
      const obj = OBJECTS[i];
      const p   = curPos[obj.id];
      if (!p) continue;
      const dx = mx - p.x, dy = my - p.y;
      if (dx * dx + dy * dy < 22 * 22) return obj;
    }
    return null;
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    hovered = hitTest(mx, my);
    canvas.style.cursor = (hovered && hovered.link) ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseleave', () => { hovered = null; canvas.style.cursor = 'default'; });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const hit  = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit && hit.link) window.location.href = hit.link;
  });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const hit   = hitTest(touch.clientX - rect.left, touch.clientY - rect.top);
    if (hit && hit.link) window.location.href = hit.link;
  }, { passive: false });

  // ── Render loop ───────────────────────────────────────────────────────
  let startTime = null;

  function render(ts) {
    if (!startTime) startTime = ts;
    const t = (ts - startTime) / 1000; // seconds

    ctx.clearRect(0, 0, CSS, CSS);

    // 1. Orbit rings (all, very faint)
    OBJECTS.forEach(obj => drawOrbit(obj));

    // 2. Back-half objects (sin(θ) < 0) at reduced opacity
    ctx.save();
    ctx.globalAlpha = 0.32;
    OBJECTS.forEach(obj => {
      const pos = getPos(obj, t);
      curPos[obj.id] = pos;
      if (!isFront(pos.theta)) drawObject(obj, pos, false);
    });
    ctx.restore();

    // 3. Earth (covers anything behind the planet)
    drawEarth();

    // 4. Front-half objects at full opacity
    OBJECTS.forEach(obj => {
      const pos = curPos[obj.id];
      if (isFront(pos.theta)) drawObject(obj, pos, hovered === obj);
    });

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
