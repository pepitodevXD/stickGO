  (() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const overlayEyebrow = document.getElementById('overlayEyebrow');
  const startButton = document.getElementById('startButton');
  const levelLabel = document.getElementById('levelLabel');
  const livesLabel = document.getElementById('livesLabel');
  const progressBar = document.getElementById('progressBar');
  const levelToast = document.getElementById('levelToast');
  const pauseButton = document.getElementById('pauseButton');
  const soundButton = document.getElementById('soundButton');
  const moveStick = document.getElementById('moveStick');
  const moveKnob = document.getElementById('moveKnob');
  const jumpButton = document.getElementById('jumpButton');
  const attackButton = document.getElementById('attackButton');

  let width = 800;
  let height = 450;
  let dpr = 1;
  let running = false;
  let started = false;
  let level = 1;
  let lives = 3;
  let cameraX = 0;
  let worldWidth = 2400;
  let groundY = 390;
  let platforms = [];
  let enemies = [];
  let particles = [];
  let lastFrame = 0;
  let toastTimer = 0;
  let soundOn = false;
  let audioContext = null;
  const keys = Object.create(null);
  const input = { move: 0, jumpHeld: false, attackHeld: false, pointerId: null, previousY: 0 };
  const player = {
    x: 70, y: 0, w: 28, h: 48, vx: 0, vy: 0,
    grounded: false, jumps: 0, facing: 1, health: 3, invulnerable: 0,
    attackTimer: 0, attackCooldown: 0, anim: 0
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = height - Math.max(57, height * 0.13);
    if (!started) {
      player.y = groundY - player.h;
      buildLevel(level);
    }
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function buildLevel(number) {
    const random = seededRandom(number * 137 + 17);
    worldWidth = Math.max(width * 3.15, width * (2.9 + Math.min(number, 20) * 0.025));
    platforms = [];
    enemies = [];
    particles = [];
    const floorH = Math.max(70, height - groundY + 12);
    const step = Math.max(150, width * 0.24);
    let x = 0;
    while (x < worldWidth) {
      const segmentW = step * (0.72 + random() * 0.52);
      const gapW = (x < width * 0.9 || x + segmentW > worldWidth - width * 0.65) ? 0 : 20 + random() * (30 + Math.min(number, 20));
      platforms.push({ x, y: groundY, w: Math.min(segmentW, worldWidth - x), h: floorH, kind: 'ground' });
      x += segmentW + gapW;
    }
    // A last, broad platform always reaches the exit.
    platforms.push({ x: worldWidth - width * 0.65, y: groundY, w: width * 0.65, h: floorH, kind: 'ground' });

    const raisedCount = Math.min(3 + Math.floor(number / 8), 7);
    for (let i = 0; i < raisedCount; i++) {
      const px = width * (0.72 + i * (0.55 + random() * 0.14));
      if (px > worldWidth - width * 0.55) break;
      const pw = width * (0.16 + random() * 0.1);
      const py = groundY - (58 + random() * Math.min(105, height * 0.23));
      platforms.push({ x: px, y: py, w: pw, h: 15, kind: 'ledge' });
    }
    platforms.sort((a, b) => a.x - b.x);

    const enemyCount = Math.min(2 + Math.floor(number / 4), 9);
    for (let i = 0; i < enemyCount; i++) {
      const ex = width * (0.75 + i * (0.42 + random() * 0.17));
      if (ex > worldWidth - width * 0.6) break;
      const range = 55 + random() * 60;
      enemies.push({ x: ex, y: groundY - 31, w: 27, h: 31, minX: Math.max(width * 0.42, ex - range), maxX: Math.min(worldWidth - width * 0.6, ex + range), dir: random() > 0.5 ? 1 : -1, speed: 28 + random() * 16 + Math.min(number, 25), alive: true, phase: random() * 6 });
    }
    player.x = 70;
    player.y = groundY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.jumps = 0;
    player.health = 3;
    player.invulnerable = 0;
    player.attackTimer = 0;
    player.attackCooldown = 0;
    cameraX = 0;
    updateHud();
  }

  function updateHud() {
    levelLabel.textContent = `NIVEL ${level} / 50`;
    livesLabel.textContent = `× ${lives}`;
    progressBar.style.width = `${Math.max(2, Math.min(100, (player.x / worldWidth) * 100))}%`;
  }

  function announce(message) {
    levelToast.textContent = message;
    levelToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => levelToast.classList.remove('show'), 1450);
  }

  function showOverlay(type) {
    overlay.classList.remove('hidden');
    if (type === 'pause') {
      overlayEyebrow.textContent = 'PAUSA';
      overlayTitle.innerHTML = 'Tómate<br><span>un respiro.</span>';
      overlayText.textContent = `Vas por el nivel ${level}. Tu aventura te espera.`;
      startButton.innerHTML = 'Continuar <span aria-hidden="true">→</span>';
    } else if (type === 'gameover') {
      overlayEyebrow.textContent = 'FIN DE LA PARTIDA';
      overlayTitle.innerHTML = '¡Buen<br><span>intento!</span>';
      overlayText.textContent = `Llegaste al nivel ${level}. ¿Una revancha?`;
      startButton.innerHTML = 'Reintentar <span aria-hidden="true">↻</span>';
    } else if (type === 'complete') {
      overlayEyebrow.textContent = '¡AVENTURA COMPLETADA!';
      overlayTitle.innerHTML = '¡Eres<br><span>imparable!</span>';
      overlayText.textContent = 'Has superado los 50 niveles de Stick-Go.';
      startButton.innerHTML = 'Jugar de nuevo <span aria-hidden="true">↻</span>';
    }
  }

  function startGame() {
    if (overlayEyebrow.textContent === 'FIN DE LA PARTIDA' || overlayEyebrow.textContent === '¡AVENTURA COMPLETADA!') {
      level = 1;
      lives = 3;
      buildLevel(level);
    }
    started = true;
    running = true;
    overlay.classList.add('hidden');
    startButton.blur();
    lastFrame = performance.now();
  }

  function pauseGame() {
    if (!started || !running) return;
    running = false;
    showOverlay('pause');
  }

  function playTone(freq, duration, type = 'sine') {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* Audio is optional; gameplay works without it. */ }
  }

  function jump() {
    if (!running || player.jumps >= 2) return;
    player.vy = player.jumps === 0 ? -height * 1.12 : -height * 0.94;
    player.jumps++;
    player.grounded = false;
    spawnParticles(player.x + player.w / 2, player.y + player.h, 5, '#f7f4d2');
    playTone(player.jumps === 1 ? 380 : 520, 0.11, 'triangle');
  }

  function attack() {
    if (!running || player.attackCooldown > 0) return;
    player.attackTimer = 0.2;
    player.attackCooldown = 0.36;
    const reach = 59;
    let hit = false;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const center = enemy.x + enemy.w / 2;
      const inFront = player.facing > 0 ? center >= player.x : center <= player.x + player.w;
      if (inFront && Math.abs(center - (player.x + player.w / 2)) < reach && Math.abs((enemy.y + enemy.h / 2) - (player.y + player.h / 2)) < 48) {
        enemy.alive = false;
        spawnParticles(center, enemy.y + enemy.h / 2, 11, '#ff8b72');
        hit = true;
      }
    }
    playTone(hit ? 240 : 160, 0.08, 'square');
  }

  function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 130;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, life: 0.35 + Math.random() * 0.3, maxLife: 0.65, color, size: 2 + Math.random() * 3 });
    }
  }

  function hurt() {
    if (player.invulnerable > 0) return;
    lives--;
    player.invulnerable = 1.3;
    player.vy = -height * 0.45;
    player.vx = -player.facing * 120;
    playTone(100, 0.18, 'sawtooth');
    updateHud();
    if (lives <= 0) {
      running = false;
      showOverlay('gameover');
    }
  }

  function nextLevel() {
    if (level >= 50) {
      running = false;
      showOverlay('complete');
      return;
    }
    level++;
    buildLevel(level);
    announce(`NIVEL ${level} / 50`);
    playTone(620, 0.16, 'triangle');
  }

  function update(dt) {
    const move = input.move || ((keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0));
    if (move) {
      player.vx += move * width * 2.4 * dt;
      player.facing = move > 0 ? 1 : -1;
    } else {
      player.vx *= Math.pow(0.001, dt);
    }
    player.vx = Math.max(-width * 0.62, Math.min(width * 0.62, player.vx));
    if ((keys.ArrowUp || keys.KeyW || keys.Space) && !input.jumpHeld) {
      input.jumpHeld = true;
      jump();
    }
    if (!(keys.ArrowUp || keys.KeyW || keys.Space)) input.jumpHeld = false;
    if ((keys.Space || input.attackHeld) && !input.attackPressed) {
      input.attackPressed = true;
      attack();
    }
    if (!keys.Space && !input.attackHeld) input.attackPressed = false;

    const oldBottom = player.y + player.h;
    player.vy += height * 2.65 * dt;
    player.y += player.vy * dt;
    player.x += player.vx * dt;
    player.x = Math.max(0, Math.min(worldWidth - player.w, player.x));
    player.grounded = false;

    if (player.vy >= 0) {
      for (const platform of platforms) {
        const horizontalOverlap = player.x + player.w > platform.x + 2 && player.x < platform.x + platform.w - 2;
        if (horizontalOverlap && oldBottom <= platform.y + 5 && player.y + player.h >= platform.y) {
          player.y = platform.y - player.h;
          player.vy = 0;
          player.grounded = true;
          player.jumps = 0;
          break;
        }
      }
    }

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.dir * enemy.speed * dt;
      if (enemy.x < enemy.minX) { enemy.x = enemy.minX; enemy.dir = 1; }
      if (enemy.x > enemy.maxX) { enemy.x = enemy.maxX; enemy.dir = -1; }
      enemy.phase += dt * 7;
      if (player.invulnerable <= 0 && player.x + player.w > enemy.x + 4 && player.x < enemy.x + enemy.w - 4 && player.y + player.h > enemy.y + 4 && player.y < enemy.y + enemy.h) hurt();
    }

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.anim += dt * (Math.abs(player.vx) > 10 ? 11 : 3);

    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += height * 0.55 * dt;
    }
    particles = particles.filter(p => p.life > 0);
    if (player.y > height + 100) hurt();

    cameraX = Math.max(0, Math.min(worldWidth - width, player.x - width * 0.34));
    if (player.x > worldWidth - width * 0.35) nextLevel();
    updateHud();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#93d5df');
    gradient.addColorStop(0.67, '#d8e7d3');
    gradient.addColorStop(1, '#f1d8ae');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Sun and drifting cloud silhouettes.
    ctx.fillStyle = '#fff4c9aa';
    ctx.beginPath(); ctx.arc(width * 0.78, height * 0.2, Math.max(24, height * 0.055), 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const layer = i < 3 ? 0 : 1;
      const baseX = ((i * 257 - cameraX * (layer ? 0.08 : 0.16)) % (width + 220) + width + 220) % (width + 220) - 100;
      const cy = height * (0.2 + (i % 3) * 0.1);
      ctx.fillStyle = layer ? '#85b9bf3d' : '#ffffff55';
      ctx.beginPath();
      ctx.ellipse(baseX, cy, 40, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX + 24, cy - 6, 22, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(baseX + 42, cy, 27, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#87b9b15c';
    ctx.beginPath(); ctx.moveTo(0, groundY - 45); ctx.quadraticCurveTo(width * .22, groundY - 130, width * .44, groundY - 40); ctx.quadraticCurveTo(width * .7, groundY - 140, width, groundY - 38); ctx.lineTo(width, groundY); ctx.lineTo(0, groundY); ctx.fill();
  }

  function drawPlatforms() {
    for (const p of platforms) {
      const sx = p.x - cameraX;
      if (sx + p.w < -3 || sx > width + 3) continue;
      if (p.kind === 'ground') {
        ctx.fillStyle = '#536d4f';
        ctx.fillRect(sx, p.y, p.w, p.h);
        ctx.fillStyle = '#9bc66b';
        ctx.fillRect(sx, p.y, p.w, 7);
        ctx.fillStyle = '#749b5a';
        for (let xx = sx + 12; xx < sx + p.w; xx += 31) {
          ctx.fillRect(xx, p.y + 17 + ((xx * 13) % 13), 4, 3);
          ctx.fillRect(xx + 9, p.y + 38 + ((xx * 7) % 15), 3, 3);
        }
      } else {
        ctx.fillStyle = '#46594e';
        roundRect(sx, p.y, p.w, p.h + 7, 5); ctx.fill();
        ctx.fillStyle = '#bedb79';
        roundRect(sx, p.y, p.w, 7, 4); ctx.fill();
      }
    }
  }

  function drawEnemy(enemy) {
    const x = enemy.x - cameraX;
    const bounce = Math.sin(enemy.phase) * 2;
    ctx.save();
    ctx.translate(x + enemy.w / 2, enemy.y + bounce);
    ctx.scale(enemy.dir, 1);
    ctx.strokeStyle = '#7b3d3d'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.fillStyle = '#ef786b';
    ctx.beginPath(); ctx.arc(0, 8, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#722f38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(-2, 7); ctx.moveTo(3, 7); ctx.lineTo(6, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(0, 23); ctx.moveTo(0, 20); ctx.lineTo(-8, 24); ctx.moveTo(0, 20); ctx.lineTo(8, 24); ctx.moveTo(0, 23); ctx.lineTo(-6, 30); ctx.moveTo(0, 23); ctx.lineTo(7, 30); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const x = player.x - cameraX;
    const y = player.y;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 13) % 2) return;
    const moving = Math.abs(player.vx) > 10 && player.grounded;
    const swing = moving ? Math.sin(player.anim) * 8 : 0;
    const cx = x + player.w / 2;
    const headY = y + 8;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#16212b'; ctx.lineWidth = 4;
    ctx.fillStyle = '#f6e9ca';
    ctx.beginPath(); ctx.arc(cx, headY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, y + 16); ctx.lineTo(cx + (player.grounded ? 0 : -player.facing * 2), y + 33);
    ctx.moveTo(cx, y + 20); ctx.lineTo(cx + player.facing * 9, y + 26);
    ctx.moveTo(cx, y + 20); ctx.lineTo(cx - player.facing * 8, y + 27);
    ctx.moveTo(cx, y + 33); ctx.lineTo(cx + swing, y + 46);
    ctx.moveTo(cx, y + 33); ctx.lineTo(cx - swing, y + 46);
    ctx.stroke();
    if (player.attackTimer > 0) {
      ctx.strokeStyle = '#fff5ba'; ctx.lineWidth = 4;
      ctx.beginPath();
      const ax = cx + player.facing * 17;
      ctx.arc(ax, y + 26, 24, player.facing > 0 ? -1.15 : Math.PI - 1.15, player.facing > 0 ? 1.15 : Math.PI + 1.15);
      ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax + player.facing * 18, y + 24); ctx.lineTo(ax + player.facing * 34, y + 16); ctx.stroke();
    }
    ctx.restore();
  }

  function drawExit() {
    const x = worldWidth - width * 0.32 - cameraX;
    const y = groundY;
    ctx.fillStyle = '#334b54'; ctx.fillRect(x, y - 76, 5, 76);
    ctx.fillStyle = '#c4f36b';
    ctx.beginPath(); ctx.moveTo(x + 5, y - 75); ctx.lineTo(x + 44, y - 63); ctx.lineTo(x + 5, y - 50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f7ffdc'; ctx.beginPath(); ctx.arc(x + 17, y - 63, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#54734c'; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    drawPlatforms();
    drawExit();
    for (const enemy of enemies) if (enemy.alive) drawEnemy(enemy);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawPlayer();
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000 || 0));
    lastFrame = now;
    if (running) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function attachStick() {
    const max = 34;
    moveStick.addEventListener('pointerdown', event => {
      event.preventDefault();
      input.pointerId = event.pointerId;
      moveStick.setPointerCapture(event.pointerId);
      updateStick(event);
    });
    moveStick.addEventListener('pointermove', event => {
      if (event.pointerId === input.pointerId) updateStick(event);
    });
    const release = event => {
      if (event.pointerId !== input.pointerId) return;
      input.pointerId = null;
      input.move = 0;
      input.previousY = 0;
      moveKnob.style.transform = 'translate(0, 0)';
    };
    moveStick.addEventListener('pointerup', release);
    moveStick.addEventListener('pointercancel', release);
    function updateStick(event) {
      const rect = moveStick.getBoundingClientRect();
      let dx = event.clientX - (rect.left + rect.width / 2);
      let dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > max) { dx = dx / distance * max; dy = dy / distance * max; }
      moveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.move = Math.abs(dx) > 8 ? Math.max(-1, Math.min(1, dx / 20)) : 0;
      if (dy < -14 && input.previousY >= -14) jump();
      input.previousY = dy;
    }
  }

  startButton.addEventListener('click', startGame);
  pauseButton.addEventListener('click', () => running ? pauseGame() : started ? startGame() : showOverlay('pause'));
  soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    soundButton.classList.toggle('active', soundOn);
    soundButton.setAttribute('aria-label', soundOn ? 'Desactivar sonido' : 'Activar sonido');
    if (soundOn) playTone(440, 0.08);
  });
  jumpButton.addEventListener('pointerdown', event => { event.preventDefault(); jump(); });
  attackButton.addEventListener('pointerdown', event => { event.preventDefault(); input.attackHeld = true; attack(); });
  attackButton.addEventListener('pointerup', () => { input.attackHeld = false; });
  attackButton.addEventListener('pointercancel', () => { input.attackHeld = false; });
  attackButton.addEventListener('pointerleave', () => { input.attackHeld = false; });
  attachStick();

  window.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape' || event.code === 'KeyP') { running ? pauseGame() : started && startGame(); return; }
    if (event.code === 'Space' && !keys.Space) attack();
    if ((event.code === 'ArrowUp' || event.code === 'KeyW') && !keys[event.code]) jump();
    keys[event.code] = true;
  });
  window.addEventListener('keyup', event => { keys[event.code] = false; });
  window.addEventListener('blur', () => { if (running && !matchMedia('(pointer: coarse)').matches) pauseGame(); });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pauseGame(); });

  resize();
  buildLevel(level);
  requestAnimationFrame(frame);
})();
