/* cv-game.js — Satellite uplink mini-game to unlock the CV
   Three signal targets orbit a radar display. Click all 3 to
   establish uplink and reveal the CV. */
(function () {
  'use strict';

  const overlay = document.getElementById('cv-game-overlay');
  const canvas  = document.getElementById('game-canvas');
  if (!overlay || !canvas) return;

  const ctx = canvas.getContext('2d');

  // ── HiDPI setup ──────────────────────────────────────────────────────
  const DPR  = Math.min(window.devicePixelRatio || 1, 2);
  const SIZE = 300; // CSS px
  canvas.style.width  = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  canvas.width  = SIZE * DPR;
  canvas.height = SIZE * DPR;
  ctx.scale(DPR, DPR);

  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADAR_R = SIZE * 0.44;

  // ── Signal targets ────────────────────────────────────────────────────
  // angularV in rad/s, orbitR in px relative to RADAR_R
  const TARGETS = [
    { id: 0, col: '#4f8aff', angle: 0,   angularV:  0.55, orbitR: RADAR_R * 0.56, locked: false },
    { id: 1, col: '#00d4aa', angle: 2.1, angularV: -0.38, orbitR: RADAR_R * 0.78, locked: false },
    { id: 2, col: '#7c5cfc', angle: 4.2, angularV:  0.62, orbitR: RADAR_R * 0.40, locked: false },
  ];

  const HIT_R = 22; // click hit radius (px)

  // ── State ─────────────────────────────────────────────────────────────
  let locked        = 0;
  let scanAngle     = -Math.PI / 2;
  let done          = false;
  let unlockTimer   = 0;  // seconds since all targets locked
  const UNLOCK_DUR  = 1.2;
  let lastTs        = null;
  let gameStartTime = null;

  // ── Computed target position at time t (seconds) ──────────────────────
  function targetPos(tgt, t) {
    const a = tgt.angle + tgt.angularV * t;
    return {
      x: CX + Math.cos(a) * tgt.orbitR,
      y: CY + Math.sin(a) * tgt.orbitR,
    };
  }

  // ── Draw helpers ──────────────────────────────────────────────────────
  function drawRadarBg() {
    // Filled circle background
    ctx.beginPath();
    ctx.arc(CX, CY, RADAR_R, 0, Math.PI * 2);
    ctx.fillStyle = '#05090f';
    ctx.fill();

    // Concentric rings
    ctx.strokeStyle = 'rgba(0,212,170,0.10)';
    ctx.lineWidth   = 0.5;
    [1/3, 2/3, 1].forEach(f => {
      ctx.beginPath();
      ctx.arc(CX, CY, RADAR_R * f, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(CX - RADAR_R, CY); ctx.lineTo(CX + RADAR_R, CY);
    ctx.moveTo(CX, CY - RADAR_R); ctx.lineTo(CX, CY + RADAR_R);
    ctx.stroke();

    // Tick marks on edge
    ctx.strokeStyle = 'rgba(0,212,170,0.35)';
    for (let i = 0; i < 36; i++) {
      const a     = (i / 36) * Math.PI * 2;
      const inner = RADAR_R - (i % 9 === 0 ? 9 : 5);
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * inner,          CY + Math.sin(a) * inner);
      ctx.lineTo(CX + Math.cos(a) * (RADAR_R - 1),  CY + Math.sin(a) * (RADAR_R - 1));
      ctx.lineWidth = i % 9 === 0 ? 1 : 0.5;
      ctx.stroke();
    }
  }

  function drawSweep() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, RADAR_R, 0, Math.PI * 2);
    ctx.clip();

    // Fading trail (20 thin sectors)
    const SWEEP_ARC = Math.PI * 0.30;
    for (let i = 0; i < 20; i++) {
      const frac  = i / 20;
      const start = scanAngle - SWEEP_ARC * (1 - frac);
      const end   = start + SWEEP_ARC / 20;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, RADAR_R, start, end);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,212,170,${0.13 * frac})`;
      ctx.fill();
    }

    // Bright leading edge
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(scanAngle) * RADAR_R, CY + Math.sin(scanAngle) * RADAR_R);
    ctx.strokeStyle = 'rgba(0,212,170,0.80)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  function drawRadarBorder() {
    ctx.beginPath();
    ctx.arc(CX, CY, RADAR_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,212,170,0.45)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  function drawTarget(tgt, t) {
    const pos = targetPos(tgt, t);

    if (tgt.locked) {
      // Locked indicator: solid ring + lock icon
      ctx.save();
      ctx.strokeStyle = tgt.col;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
      ctx.stroke();

      // Checkmark
      ctx.beginPath();
      ctx.moveTo(pos.x - 5, pos.y);
      ctx.lineTo(pos.x - 1, pos.y + 5);
      ctx.lineTo(pos.x + 6, pos.y - 5);
      ctx.strokeStyle = tgt.col;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // LOCKED label
      ctx.fillStyle    = tgt.col + 'bb';
      ctx.font         = '8px DM Mono, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('LOCKED', pos.x, pos.y + 15);
      ctx.restore();
      return;
    }

    // Blinking triangle (satellite silhouette)
    const blink = 0.55 + 0.45 * Math.sin(t * 3.5 + tgt.id * 2.1);
    ctx.save();
    ctx.shadowColor = tgt.col;
    ctx.shadowBlur  = 8 * blink;

    ctx.fillStyle = tgt.col;
    ctx.beginPath();
    ctx.moveTo(pos.x,      pos.y - 7);
    ctx.lineTo(pos.x + 5,  pos.y + 4);
    ctx.lineTo(pos.x - 5,  pos.y + 4);
    ctx.closePath();
    ctx.fill();

    // Expanding signal ring
    ctx.strokeStyle = tgt.col + '50';
    ctx.lineWidth   = 0.75;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 11 + 5 * Math.sin(t * 2.2 + tgt.id), 0, Math.PI * 2);
    ctx.stroke();

    // SIG label
    ctx.fillStyle    = tgt.col + '90';
    ctx.font         = '8px DM Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowBlur   = 0;
    ctx.fillText('SIG-' + (tgt.id + 1), pos.x, pos.y - 9);

    ctx.restore();
  }

  function drawStatus() {
    // Bottom centre text
    const remaining = TARGETS.filter(t => !t.locked).length;
    const text = locked === 3
      ? '▶  UPLINK ESTABLISHED'
      : locked + ' / 3  SIGNALS LOCKED';
    ctx.fillStyle    = locked === 3 ? '#00d4aa' : 'rgba(0,212,170,0.55)';
    ctx.font         = '10px DM Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CX, CY + RADAR_R + 14);
  }

  function drawUnlockFlash(progress) {
    // Expanding circle + text flash on completion
    ctx.save();
    ctx.globalAlpha = 1 - progress;

    const r = RADAR_R * (0.3 + progress * 0.8);
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth   = 2.5 * (1 - progress);
    ctx.stroke();

    ctx.globalAlpha = Math.min(1, (1 - progress) * 2.5);
    ctx.fillStyle    = '#00d4aa';
    ctx.font         = `bold ${Math.round(14 + progress * 6)}px DM Mono, monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACCESS GRANTED', CX, CY - 12);
    ctx.font         = '11px DM Mono, monospace';
    ctx.fillStyle    = '#4f8aff';
    ctx.fillText('loading mission data…', CX, CY + 10);

    ctx.restore();
  }

  // ── Counter display (DOM) ─────────────────────────────────────────────
  const counterEl = document.getElementById('game-lock-counter');
  function updateCounter() {
    if (counterEl) counterEl.textContent = locked + ' / 3 signals locked';
  }

  // ── Input handling ────────────────────────────────────────────────────
  function handleClick(mx, my) {
    if (done || !gameStartTime) return;
    const t = (performance.now() - gameStartTime) / 1000;

    TARGETS.forEach(tgt => {
      if (tgt.locked) return;
      const pos = targetPos(tgt, t);
      const dx = mx - pos.x, dy = my - pos.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) {
        tgt.locked = true;
        locked++;
        updateCounter();
        if (locked >= 3) done = true;
      }
    });
  }

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    handleClick(e.clientX - r.left, e.clientY - r.top);
  });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const r     = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    handleClick(touch.clientX - r.left, touch.clientY - r.top);
  }, { passive: false });

  // ── Skip button ───────────────────────────────────────────────────────
  const skipBtn = document.getElementById('game-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      overlay.style.transition = 'opacity 0.5s ease';
      overlay.style.opacity    = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
        window.loadCV && window.loadCV();
      }, 500);
    });
  }

  // ── Render loop ───────────────────────────────────────────────────────
  function render(ts) {
    if (!lastTs)        lastTs = ts;
    if (!gameStartTime) gameStartTime = ts;

    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    const t = (ts - gameStartTime) / 1000;

    ctx.clearRect(0, 0, SIZE, SIZE);

    if (done) {
      unlockTimer += dt;
      const progress = Math.min(unlockTimer / UNLOCK_DUR, 1);

      // Draw fading radar + targets
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress * 0.6);
      drawRadarBg();
      drawSweep();
      TARGETS.forEach(tgt => drawTarget(tgt, t));
      drawRadarBorder();
      ctx.restore();

      drawUnlockFlash(progress);
      drawStatus();

      if (progress >= 1) {
        overlay.style.transition = 'opacity 0.6s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
          window.loadCV && window.loadCV();
        }, 600);
        return; // stop loop
      }

      requestAnimationFrame(render);
      return;
    }

    scanAngle += dt * 1.4; // sweep rotation speed

    drawRadarBg();
    drawSweep();
    TARGETS.forEach(tgt => drawTarget(tgt, t));
    drawRadarBorder();
    drawStatus();

    requestAnimationFrame(render);
  }

  canvas.style.cursor = 'crosshair';
  requestAnimationFrame(render);
})();
