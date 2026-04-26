// Active nav link
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

// Animated stars background
(function () {
  const canvas = document.getElementById('stars-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2,
        a: Math.random(),
        speed: 0.0003 + Math.random() * 0.0005,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach((s) => {
      s.a += s.speed;
      const alpha = 0.2 + 0.8 * Math.abs(Math.sin(s.a));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,210,255,${alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  initStars();
  draw();
  window.addEventListener('resize', () => { resize(); initStars(); });
})();

// Scroll reveal
(function () {
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
})();

// Date formatter (shared)
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Click sparkle particles ──────────────────────────────────────────────
(function () {
  const COLS = ['#4f8aff', '#7c5cfc', '#00d4aa', '#ff7eb3'];
  const particles = [];

  const sparkleCanvas = document.createElement('canvas');
  sparkleCanvas.id = 'sparkle-canvas';
  document.body.appendChild(sparkleCanvas);
  const sctx = sparkleCanvas.getContext('2d');

  function resizeSparkle() {
    sparkleCanvas.width  = window.innerWidth;
    sparkleCanvas.height = window.innerHeight;
  }
  resizeSparkle();
  window.addEventListener('resize', resizeSparkle);

  document.addEventListener('click', e => {
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.2;
      particles.push({
        x:    e.clientX,
        y:    e.clientY,
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed - 0.8,
        r:    1 + Math.random() * 1.8,
        life: 1.0,
        col:  COLS[Math.floor(Math.random() * COLS.length)],
      });
    }
  });

  (function loop() {
    sctx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.10; // gravity
      p.life -= 0.038;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      sctx.save();
      sctx.globalAlpha = p.life * p.life; // quadratic fade
      sctx.fillStyle   = p.col;
      sctx.shadowColor = p.col;
      sctx.shadowBlur  = 5;
      sctx.beginPath();
      sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      sctx.fill();
      sctx.restore();
    }
    requestAnimationFrame(loop);
  })();
})();
