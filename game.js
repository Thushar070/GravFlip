// @license PROPRIETARY — All rights reserved. Do not copy or reuse.

// ═══════════════════════════════════════════════════════════════
//  CONFIG — split into grouped objects for structure
// ═══════════════════════════════════════════════════════════════
const DISPLAY = {
  WIDTH: 800,
  HEIGHT: 450,
  FLOOR_HEIGHT: 24
};

const PHYSICS = {
  GRAVITY: 0.5,
  JUMP_FORCE: -12,
  MAX_VY: 10
};

const SPEED = {
  INITIAL: 3,
  MAX: 8,
  INCREMENT: 0.0005
};

const PLAYER_CFG = {
  SIZE: 22,
  TRAIL_LEN: 8,
  SQUISH_FRAMES: 12
};

const GAMEPLAY = {
  MIN_GAP: 130,
  STAR_POINTS: 50,
  COYOTE_TIME: 80,
  DANGER_DISTANCE: 40,
  ZONE_THRESHOLD: 1000,
  OBSTACLE_MIN_W: 28,
  OBSTACLE_MAX_W: 40,
  GAP_MIN: 220,
  GAP_MAX: 400,
  STAR_RADIUS: 14,
  COYOTE_EDGE_PX: 4
};

const COLORS = {
  BG: '#0a0a1a',
  FLOOR: '#1a1a4a',
  FLOOR_GLOW: '#4444ff',
  OBSTACLE: '#ff3333',
  OBSTACLE_GLOW: '#ff6666',
  STAR: '#ffdd00',
  PLAYER: '#ffffff',
  VISOR: '#88ccff',
  TRAIL: '#4488ff',
  TEXT: '#ffffff',
  NEON_PINK: '#ff44aa',
  NEON_CYAN: '#00ffff'
};

const PARTICLE_CFG = {
  DEATH_COUNT: 18,
  DEATH_SPEED_MIN: 2,
  DEATH_SPEED_MAX: 6,
  DEATH_LIFE_MIN: 40,
  DEATH_LIFE_MAX: 60,
  STAR_COUNT: 8,
  STAR_SPEED_MIN: 1,
  STAR_SPEED_MAX: 3,
  STAR_LIFE: 20
};

const AUDIO_CFG = {
  DRONE_FREQ: 55,
  DRONE_GAIN: 0.03,
  FLIP_FREQ_START: 300,
  FLIP_FREQ_END: 600,
  FLIP_DURATION: 0.08,
  COLLECT_FREQ_A: 523,
  COLLECT_FREQ_B: 659,
  COLLECT_DURATION: 0.12,
  DEATH_DURATION: 0.3,
  DEATH_FILTER_FREQ: 400
};

const STARFIELD_COUNT = 100;

// Combined reference
const CONFIG = {
  WIDTH: DISPLAY.WIDTH,
  HEIGHT: DISPLAY.HEIGHT,
  PLAYER_SIZE: PLAYER_CFG.SIZE,
  GRAVITY: PHYSICS.GRAVITY,
  JUMP_FORCE: PHYSICS.JUMP_FORCE,
  INITIAL_SPEED: SPEED.INITIAL,
  MAX_SPEED: SPEED.MAX,
  SPEED_INCREMENT: SPEED.INCREMENT,
  FLOOR_HEIGHT: DISPLAY.FLOOR_HEIGHT,
  MIN_GAP: GAMEPLAY.MIN_GAP,
  STAR_POINTS: GAMEPLAY.STAR_POINTS,
  COYOTE_TIME: GAMEPLAY.COYOTE_TIME,
  DANGER_DISTANCE: GAMEPLAY.DANGER_DISTANCE,
  COLORS: COLORS
};

// ═══════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════════
const cvs = document.getElementById('gameCanvas');
const ctx = cvs.getContext('2d');
cvs.width = DISPLAY.WIDTH;
cvs.height = DISPLAY.HEIGHT;

function resizeCanvas() {
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const ar = DISPLAY.WIDTH / DISPLAY.HEIGHT;
  let w, h;
  if (cw / ch > ar) {
    h = ch;
    w = h * ar;
  } else {
    w = cw;
    h = w / ar;
  }
  cvs.style.width = w + 'px';
  cvs.style.height = h + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ═══════════════════════════════════════════════════════════════
//  AUDIO SYSTEM (Web Audio API — no external files)
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;
let droneOsc = null;
let droneGain = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { /* silent fallback */ }
}

function flipSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(AUDIO_CFG.FLIP_FREQ_START, t);
  o.frequency.linearRampToValueAtTime(AUDIO_CFG.FLIP_FREQ_END, t + AUDIO_CFG.FLIP_DURATION);
  o.detune.setValueAtTime((Math.random() - 0.5) * 40, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.15, t + 0.001);
  g.gain.linearRampToValueAtTime(0, t + AUDIO_CFG.FLIP_DURATION);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t);
  o.stop(t + AUDIO_CFG.FLIP_DURATION + 0.01);
}

function collectSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = AUDIO_CFG.COLLECT_DURATION;
  [AUDIO_CFG.COLLECT_FREQ_A, AUDIO_CFG.COLLECT_FREQ_B].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.005);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t + i * 0.04);
    o.stop(t + dur + 0.02);
  });
}

function deathSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = AUDIO_CFG.DEATH_DURATION;
  const bufSize = audioCtx.sampleRate * dur;
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const flt = audioCtx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(AUDIO_CFG.DEATH_FILTER_FREQ, t);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(audioCtx.destination);
  src.start(t);
  src.stop(t + dur + 0.01);
}

function startDrone() {
  if (!audioCtx) return;
  stopDrone();
  droneOsc = audioCtx.createOscillator();
  droneGain = audioCtx.createGain();
  droneOsc.type = 'sine';
  droneOsc.frequency.setValueAtTime(AUDIO_CFG.DRONE_FREQ, audioCtx.currentTime);
  droneGain.gain.setValueAtTime(AUDIO_CFG.DRONE_GAIN, audioCtx.currentTime);
  droneOsc.connect(droneGain);
  droneGain.connect(audioCtx.destination);
  droneOsc.start();
}

function stopDrone() {
  if (droneOsc) {
    try { droneOsc.stop(); } catch (e) {}
    droneOsc = null;
    droneGain = null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════════
function loadHighScore() {
  try { return parseInt(localStorage.getItem('gravflip_best') || '0', 10); } catch (e) { return 0; }
}
function saveHighScore(s) {
  try { localStorage.setItem('gravflip_best', s.toString()); } catch (e) {}
}

function createStarfield() {
  const arr = [];
  for (let i = 0; i < STARFIELD_COUNT; i++) {
    arr.push({
      x: Math.random() * DISPLAY.WIDTH,
      y: Math.random() * DISPLAY.HEIGHT,
      size: 0.5 + Math.random() * 2,
      brightness: 0.3 + Math.random() * 0.7,
      speed: 0.1 + Math.random() * 0.4
    });
  }
  return arr;
}

function createInitialState() {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  return {
    screen: 'start',
    score: 0,
    highScore: loadHighScore(),
    speed: SPEED.INITIAL,
    frameCount: 0,
    gravityFlipped: false,
    distanceTraveled: 0,
    currentZone: 1,
    comboCount: 0,
    coyoteTimer: 0,
    dangerWarning: false,
    player: {
      x: DISPLAY.WIDTH * 0.2,
      y: floorY - PLAYER_CFG.SIZE,
      vy: 0,
      width: PLAYER_CFG.SIZE,
      height: PLAYER_CFG.SIZE,
      trail: [],
      alive: true,
      squishTimer: 0,
      squishDirection: 1
    },
    obstacles: [],
    stars: [],
    particles: [],
    popups: [],
    starfield: createStarfield(),
    screenShake: { active: false, intensity: 0, duration: 0, timer: 0 },
    deathFlash: { active: false, timer: 0, duration: 15 },
    zoneFlash: { active: false, timer: 0, duration: 90, label: '' },
    pausedAt: 0,
    nextObstacleX: DISPLAY.WIDTH + 200,
    deathDelay: 0,
    newBest: false,
    demoY: DISPLAY.HEIGHT / 2,
    demoVy: -2,
    demoFlipped: false
  };
}

let gs = createInitialState();
let lastTime = 0;

// ═══════════════════════════════════════════════════════════════
//  MOBILE TAP ZONE
// ═══════════════════════════════════════════════════════════════
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let tapZone = null;

if (isTouchDevice) {
  tapZone = document.createElement('div');
  tapZone.id = 'tap-zone';
  tapZone.textContent = 'TAP';
  tapZone.classList.add('hidden');
  document.body.appendChild(tapZone);

  tapZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleInput();
  }, { passive: false });
}

function updateTapZoneVisibility() {
  if (!tapZone) return;
  if (gs.screen === 'playing' || gs.screen === 'paused') {
    tapZone.classList.remove('hidden');
  } else {
    tapZone.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MOBILE SCROLL PREVENTION
// ═══════════════════════════════════════════════════════════════
document.body.style.overflow = 'hidden';
document.body.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ═══════════════════════════════════════════════════════════════
//  GRAVITY FLIP
// ═══════════════════════════════════════════════════════════════
function flipGravity() {
  gs.gravityFlipped = !gs.gravityFlipped;
  const p = gs.player;
  p.squishTimer = PLAYER_CFG.SQUISH_FRAMES;
  p.squishDirection = gs.gravityFlipped ? -1 : 1;
  p.vy = gs.gravityFlipped ? PHYSICS.JUMP_FORCE : -PHYSICS.JUMP_FORCE;
  flipSound();
  if (gs.coyoteTimer > 0) {
    gs.coyoteTimer = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PAUSE SYSTEM
// ═══════════════════════════════════════════════════════════════
function pauseGame() {
  gs.screen = 'paused';
  gs.pausedAt = performance.now();
  stopDrone();
  updateTapZoneVisibility();
}

function resumeGame() {
  const pauseDuration = performance.now() - gs.pausedAt;
  lastTime += pauseDuration;
  gs.screen = 'playing';
  startDrone();
  updateTapZoneVisibility();
}

// ═══════════════════════════════════════════════════════════════
//  LEVEL GENERATION
// ═══════════════════════════════════════════════════════════════
function generateObstacle() {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  const playH = floorY - ceilY;
  const fromFloor = Math.random() > 0.5;
  const w = GAMEPLAY.OBSTACLE_MIN_W + Math.random() * (GAMEPLAY.OBSTACLE_MAX_W - GAMEPLAY.OBSTACLE_MIN_W);
  const maxH = playH - GAMEPLAY.MIN_GAP;
  const h = 40 + Math.random() * (maxH - 40);

  let x = gs.nextObstacleX;
  let y, oy;

  if (fromFloor) {
    y = floorY - h;
    oy = y;
  } else {
    y = ceilY;
    oy = y;
  }

  gs.obstacles.push({
    x: x,
    y: oy,
    width: w,
    height: h,
    fromFloor: fromFloor,
    glowPhase: Math.random() * Math.PI * 2
  });

  // Place a star in the gap
  const gapReduction = Math.max(0, (gs.currentZone - 1) * 15);
  const gap = GAMEPLAY.GAP_MIN + Math.random() * (GAMEPLAY.GAP_MAX - GAMEPLAY.GAP_MIN) - gapReduction;
  gs.nextObstacleX = x + gap;

  // Star placement
  if (Math.random() > 0.35) {
    let starY;
    if (fromFloor) {
      starY = ceilY + 20 + Math.random() * (y - ceilY - 40);
    } else {
      starY = (y + h + 20) + Math.random() * (floorY - y - h - 40);
    }
    starY = Math.max(ceilY + 15, Math.min(floorY - 15, starY));
    gs.stars.push({
      x: x + w / 2 + (Math.random() - 0.5) * 60,
      y: starY,
      radius: GAMEPLAY.STAR_RADIUS,
      phase: Math.random() * Math.PI * 2
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════════════════════════
function emitDeathParticles(cx, cy) {
  const cols = [COLORS.NEON_PINK, COLORS.NEON_CYAN, COLORS.STAR, COLORS.OBSTACLE];
  for (let i = 0; i < PARTICLE_CFG.DEATH_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = PARTICLE_CFG.DEATH_SPEED_MIN + Math.random() * (PARTICLE_CFG.DEATH_SPEED_MAX - PARTICLE_CFG.DEATH_SPEED_MIN);
    const life = PARTICLE_CFG.DEATH_LIFE_MIN + Math.random() * (PARTICLE_CFG.DEATH_LIFE_MAX - PARTICLE_CFG.DEATH_LIFE_MIN);
    gs.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: life,
      maxLife: life,
      color: cols[Math.floor(Math.random() * cols.length)],
      size: 2 + Math.random() * 3
    });
  }
}

function emitStarParticles(cx, cy) {
  for (let i = 0; i < PARTICLE_CFG.STAR_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = PARTICLE_CFG.STAR_SPEED_MIN + Math.random() * (PARTICLE_CFG.STAR_SPEED_MAX - PARTICLE_CFG.STAR_SPEED_MIN);
    gs.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: PARTICLE_CFG.STAR_LIFE,
      maxLife: PARTICLE_CFG.STAR_LIFE,
      color: COLORS.STAR,
      size: 1.5 + Math.random() * 2
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  POPUPS
// ═══════════════════════════════════════════════════════════════
function spawnPopup(text, x, y, color, size) {
  gs.popups.push({
    text: text,
    x: x,
    y: y,
    vy: -1.2,
    life: 60,
    maxLife: 60,
    color: color || COLORS.NEON_CYAN,
    size: size || 22
  });
}

function spawnZonePopup(label) {
  gs.popups.push({
    text: label,
    x: DISPLAY.WIDTH / 2,
    y: DISPLAY.HEIGHT / 2 - 20,
    vy: -0.5,
    life: 90,
    maxLife: 90,
    color: COLORS.NEON_PINK,
    size: 36
  });
}

// ═══════════════════════════════════════════════════════════════
//  COMBO SYSTEM
// ═══════════════════════════════════════════════════════════════
function getComboMultiplier() {
  const c = gs.comboCount;
  if (c >= 8) return 4;
  if (c >= 5) return 3;
  if (c >= 3) return 2;
  return 1;
}

function checkComboMilestone() {
  const c = gs.comboCount;
  const p = gs.player;
  if (c === 3) spawnPopup('COMBO x2!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 22);
  else if (c === 5) spawnPopup('COMBO x3!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 22);
  else if (c === 8) spawnPopup('COMBO x4!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 24);
}

// ═══════════════════════════════════════════════════════════════
//  COLLISION DETECTION
// ═══════════════════════════════════════════════════════════════
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleCollide(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return (dx * dx + dy * dy) < (r * r);
}

// ═══════════════════════════════════════════════════════════════
//  DEATH SEQUENCE
// ═══════════════════════════════════════════════════════════════
function killPlayer() {
  const p = gs.player;
  p.alive = false;
  gs.comboCount = 0;
  gs.screenShake = { active: true, intensity: 8, duration: 400, timer: 0 };
  gs.deathFlash = { active: true, timer: 0, duration: 15 };
  emitDeathParticles(p.x + p.width / 2, p.y + p.height / 2);
  deathSound();
  stopDrone();
  gs.deathDelay = 48; // ~800ms at 60fps
  gs.newBest = false;
  if (gs.score > gs.highScore) {
    gs.highScore = gs.score;
    saveHighScore(gs.highScore);
    gs.newBest = true;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RESET GAME
// ═══════════════════════════════════════════════════════════════
function resetGame() {
  const hs = gs.highScore;
  gs = createInitialState();
  gs.highScore = hs;
  gs.screen = 'playing';
  gs.player.alive = true;
  gs.nextObstacleX = DISPLAY.WIDTH + 200;
  startDrone();
  document.body.classList.add('game-running');
  updateTapZoneVisibility();
}

// ═══════════════════════════════════════════════════════════════
//  START GAME (from start screen)
// ═══════════════════════════════════════════════════════════════
function startGame() {
  initAudio();
  resetGame();
}

// ═══════════════════════════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════════════════════════
function handleInput() {
  switch (gs.screen) {
    case 'start':
      startGame();
      break;
    case 'playing':
      flipGravity();
      break;
    case 'paused':
      resumeGame();
      break;
    case 'dead':
      resetGame();
      break;
  }
}

function handlePauseToggle() {
  if (gs.screen === 'playing') pauseGame();
  else if (gs.screen === 'paused') resumeGame();
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleInput();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    handlePauseToggle();
  }
});

cvs.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleInput();
}, { passive: false });

cvs.addEventListener('mousedown', (e) => {
  e.preventDefault();
  handleInput();
});

// ═══════════════════════════════════════════════════════════════
//  UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function updatePlayer(dt) {
  const p = gs.player;
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;

  // Gravity
  if (gs.gravityFlipped) {
    p.vy -= PHYSICS.GRAVITY * dt;
  } else {
    p.vy += PHYSICS.GRAVITY * dt;
  }

  // Clamp vy
  if (p.vy > PHYSICS.MAX_VY) p.vy = PHYSICS.MAX_VY;
  if (p.vy < -PHYSICS.MAX_VY) p.vy = -PHYSICS.MAX_VY;

  p.y += p.vy * dt;

  // Floor collision
  if (p.y + p.height >= floorY) {
    p.y = floorY - p.height;
    p.vy = 0;
  }
  // Ceiling collision
  if (p.y <= ceilY) {
    p.y = ceilY;
    p.vy = 0;
  }

  // Trail
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > PLAYER_CFG.TRAIL_LEN) p.trail.shift();

  // Squish
  if (p.squishTimer > 0) p.squishTimer -= dt;
}

function updateObstacles(dt) {
  const spd = gs.speed * dt;
  for (let i = gs.obstacles.length - 1; i >= 0; i--) {
    gs.obstacles[i].x -= spd;
    gs.obstacles[i].glowPhase += 0.05 * dt;
    if (gs.obstacles[i].x + gs.obstacles[i].width < -50) {
      gs.obstacles.splice(i, 1);
    }
  }
  // Generate new obstacles
  while (gs.nextObstacleX < DISPLAY.WIDTH + 400) {
    generateObstacle();
  }
  // Shift nextObstacleX
  gs.nextObstacleX -= spd;
}

function updateStars(dt) {
  const spd = gs.speed * dt;
  for (let i = gs.stars.length - 1; i >= 0; i--) {
    gs.stars[i].x -= spd;
    gs.stars[i].phase += 0.06 * dt;
    if (gs.stars[i].x < -30) {
      gs.stars.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const pt = gs.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) gs.particles.splice(i, 1);
  }
}

function updatePopups(dt) {
  for (let i = gs.popups.length - 1; i >= 0; i--) {
    const pp = gs.popups[i];
    pp.y += pp.vy * dt;
    pp.life -= dt;
    if (pp.life <= 0) gs.popups.splice(i, 1);
  }
}

function updateStarfield(dt) {
  const spd = gs.speed * 0.2;
  for (let i = 0; i < gs.starfield.length; i++) {
    const s = gs.starfield[i];
    s.x -= s.speed * spd * dt;
    if (s.x < 0) {
      s.x = DISPLAY.WIDTH;
      s.y = Math.random() * DISPLAY.HEIGHT;
    }
  }
}

function updateScreenShake(dt) {
  const ss = gs.screenShake;
  if (!ss.active) return;
  ss.timer += dt * 16.67;
  if (ss.timer >= ss.duration) {
    ss.active = false;
    ss.intensity = 0;
  } else {
    ss.intensity = 8 * (1 - ss.timer / ss.duration);
  }
}

function updateDeathFlash(dt) {
  const df = gs.deathFlash;
  if (!df.active) return;
  df.timer += dt;
  if (df.timer >= df.duration) df.active = false;
}

function updateZoneFlash(dt) {
  const zf = gs.zoneFlash;
  if (!zf.active) return;
  zf.timer += dt;
  if (zf.timer >= zf.duration) zf.active = false;
}

function checkObstacleCollisions() {
  const p = gs.player;
  const px = p.x;
  const py = p.y;
  const pw = p.width;
  const ph = p.height;

  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    if (aabbOverlap(px, py, pw, ph, o.x, o.y, o.width, o.height)) {
      // Check if it's a glancing edge hit (coyote time)
      const overlapX = Math.min(px + pw, o.x + o.width) - Math.max(px, o.x);
      if (overlapX <= GAMEPLAY.COYOTE_EDGE_PX && gs.coyoteTimer <= 0) {
        gs.coyoteTimer = GAMEPLAY.COYOTE_TIME;
        return; // Don't kill yet
      }
      if (gs.coyoteTimer > 0 && overlapX <= GAMEPLAY.COYOTE_EDGE_PX) {
        return; // Still in coyote window, edge hit
      }
      // Full collision — die
      killPlayer();
      return;
    }
  }

  // Decrement coyote timer
  // (handled in main update)
}

function checkStarCollisions() {
  const p = gs.player;
  const pcx = p.x + p.width / 2;
  const pcy = p.y + p.height / 2;

  for (let i = gs.stars.length - 1; i >= 0; i--) {
    const s = gs.stars[i];
    if (circleCollide(pcx, pcy, s.x, s.y, s.radius)) {
      emitStarParticles(s.x, s.y);
      gs.comboCount++;
      const mult = getComboMultiplier();
      gs.score += GAMEPLAY.STAR_POINTS * mult;
      checkComboMilestone();
      collectSound();
      gs.stars.splice(i, 1);
    }
  }
}

function checkDangerWarning() {
  const p = gs.player;
  gs.dangerWarning = false;
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    const dist = o.x - (p.x + p.width);
    if (dist > -p.width && dist < GAMEPLAY.DANGER_DISTANCE) {
      gs.dangerWarning = true;
      return;
    }
  }
}

function checkZoneMilestone() {
  const newZone = 1 + Math.floor(gs.score / GAMEPLAY.ZONE_THRESHOLD);
  if (newZone > gs.currentZone) {
    gs.currentZone = newZone;
    const label = '\u2014 ZONE ' + gs.currentZone + ' \u2014';
    gs.zoneFlash = { active: true, timer: 0, duration: 90, label: label };
    spawnZonePopup(label);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAWING FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function drawBackground() {
  ctx.fillStyle = COLORS.BG;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  // Zone tint
  if (gs.currentZone > 1) {
    let tintColor;
    if (gs.currentZone === 2) tintColor = 'rgba(30,30,120,0.08)';
    else if (gs.currentZone === 3) tintColor = 'rgba(80,20,100,0.08)';
    else tintColor = 'rgba(100,20,20,0.08)';
    ctx.fillStyle = tintColor;
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  }

  // Starfield
  for (let i = 0; i < gs.starfield.length; i++) {
    const s = gs.starfield[i];
    ctx.fillStyle = 'rgba(255,255,255,' + s.brightness + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpeedLines() {
  if (gs.speed <= 6) return;
  const alpha = Math.min(0.08, (gs.speed - 6) * 0.02);
  ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const y = Math.random() * DISPLAY.HEIGHT;
    const startX = Math.random() * DISPLAY.WIDTH * 0.3;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + DISPLAY.WIDTH * (0.4 + Math.random() * 0.6), y);
    ctx.stroke();
  }
}

function drawFloorAndCeiling() {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = 0;

  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = COLORS.FLOOR_GLOW;

  // Floor
  ctx.fillStyle = COLORS.FLOOR;
  ctx.fillRect(0, floorY, DISPLAY.WIDTH, DISPLAY.FLOOR_HEIGHT);
  ctx.fillStyle = COLORS.FLOOR_GLOW;
  ctx.fillRect(0, floorY, DISPLAY.WIDTH, 2);

  // Ceiling
  ctx.fillStyle = COLORS.FLOOR;
  ctx.fillRect(0, ceilY, DISPLAY.WIDTH, DISPLAY.FLOOR_HEIGHT);
  ctx.fillStyle = COLORS.FLOOR_GLOW;
  ctx.fillRect(0, DISPLAY.FLOOR_HEIGHT - 2, DISPLAY.WIDTH, 2);

  ctx.restore();
}

function drawObstacles() {
  ctx.save();
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    const glow = 8 + 4 * Math.sin(o.glowPhase);
    ctx.shadowBlur = glow;
    ctx.shadowColor = COLORS.OBSTACLE_GLOW;
    ctx.fillStyle = COLORS.OBSTACLE;
    ctx.fillRect(o.x, o.y, o.width, o.height);

    // Zigzag spike tips
    ctx.fillStyle = COLORS.OBSTACLE_GLOW;
    const spikeH = 8;
    const spikeW = o.width / 4;
    if (o.fromFloor) {
      // Spikes on top
      for (let s = 0; s < 4; s++) {
        const sx = o.x + s * spikeW;
        ctx.beginPath();
        ctx.moveTo(sx, o.y);
        ctx.lineTo(sx + spikeW / 2, o.y - spikeH);
        ctx.lineTo(sx + spikeW, o.y);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Spikes on bottom
      const bot = o.y + o.height;
      for (let s = 0; s < 4; s++) {
        const sx = o.x + s * spikeW;
        ctx.beginPath();
        ctx.moveTo(sx, bot);
        ctx.lineTo(sx + spikeW / 2, bot + spikeH);
        ctx.lineTo(sx + spikeW, bot);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawStars() {
  ctx.save();
  for (let i = 0; i < gs.stars.length; i++) {
    const s = gs.stars[i];
    const pulse = 1 + 0.2 * Math.sin(s.phase);
    const r = 6 * pulse;
    ctx.shadowBlur = 10;
    ctx.shadowColor = COLORS.STAR;
    ctx.fillStyle = COLORS.STAR;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner white dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTrail() {
  const p = gs.player;
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    const alpha = ((i + 1) / p.trail.length) * 0.35;
    const size = p.width * ((i + 1) / p.trail.length) * 0.7;
    ctx.fillStyle = 'rgba(68,136,255,' + alpha + ')';
    ctx.fillRect(t.x - size * 0.1, t.y + (p.height - size) / 2, size * 0.6, size);
  }
}

function drawPlayer() {
  const p = gs.player;
  if (!p.alive && gs.deathDelay <= 0) return;

  ctx.save();
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;

  // Squish transform
  let scaleY = 1;
  if (p.squishTimer > 0) {
    const t = p.squishTimer / PLAYER_CFG.SQUISH_FRAMES;
    scaleY = 0.6 + 0.4 * (1 - t);
  }

  ctx.translate(cx, cy);
  ctx.scale(1, scaleY);
  ctx.translate(-cx, -cy);

  // Coyote glow
  if (gs.coyoteTimer > 0) {
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff8800';
  } else {
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffffff';
  }

  // Body (rounded rect)
  const bx = p.x;
  const by = p.y;
  const bw = p.width;
  const bh = p.height;
  const r = 5;
  ctx.fillStyle = COLORS.PLAYER;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();

  // Visor
  ctx.shadowBlur = 4;
  ctx.shadowColor = COLORS.VISOR;
  ctx.fillStyle = COLORS.VISOR;
  const vw = bw * 0.55;
  const vh = bh * 0.3;
  const vx = bx + bw * 0.3;
  const vy = by + bh * 0.25;
  const vr = 3;
  ctx.beginPath();
  ctx.moveTo(vx + vr, vy);
  ctx.lineTo(vx + vw - vr, vy);
  ctx.quadraticCurveTo(vx + vw, vy, vx + vw, vy + vr);
  ctx.lineTo(vx + vw, vy + vh - vr);
  ctx.quadraticCurveTo(vx + vw, vy + vh, vx + vw - vr, vy + vh);
  ctx.lineTo(vx + vr, vy + vh);
  ctx.quadraticCurveTo(vx, vy + vh, vx, vy + vh - vr);
  ctx.lineTo(vx, vy + vr);
  ctx.quadraticCurveTo(vx, vy, vx + vr, vy);
  ctx.closePath();
  ctx.fill();

  // Antenna dots
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.NEON_CYAN;
  if (gs.gravityFlipped) {
    // Bottom (since flipped)
    ctx.beginPath();
    ctx.arc(bx + bw * 0.35, by + bh + 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + bw * 0.65, by + bh + 3, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Top
    ctx.beginPath();
    ctx.arc(bx + bw * 0.35, by - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + bw * 0.65, by - 3, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  for (let i = 0; i < gs.particles.length; i++) {
    const pt = gs.particles[i];
    const alpha = pt.life / pt.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPopups() {
  for (let i = 0; i < gs.popups.length; i++) {
    const pp = gs.popups[i];
    const alpha = pp.life / pp.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pp.color;
    ctx.font = 'bold ' + pp.size + 'px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8;
    ctx.shadowColor = pp.color;
    ctx.fillText(pp.text, pp.x, pp.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawDangerVignette() {
  if (!gs.dangerWarning) return;
  const pulse = 0.15 + 0.1 * Math.sin(gs.frameCount * 0.15);
  const grd = ctx.createRadialGradient(
    DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2, DISPLAY.HEIGHT * 0.3,
    DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2, DISPLAY.HEIGHT * 0.8
  );
  grd.addColorStop(0, 'rgba(255,0,0,0)');
  grd.addColorStop(1, 'rgba(255,0,0,' + pulse + ')');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
}

function drawVignette() {
  const grd = ctx.createRadialGradient(
    DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2, DISPLAY.HEIGHT * 0.35,
    DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2, DISPLAY.HEIGHT * 0.85
  );
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
}

function drawHUD() {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'top';

  // Score (top left)
  ctx.font = '11px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 16, 12);
  ctx.font = 'bold 22px Orbitron, monospace';
  ctx.fillStyle = COLORS.TEXT;
  ctx.fillText(gs.score.toString(), 16, 26);

  // Distance
  ctx.font = '10px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('DIST ' + Math.floor(gs.distanceTraveled), 16, 52);

  // Best (top right)
  ctx.textAlign = 'right';
  ctx.font = '11px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('BEST', DISPLAY.WIDTH - 16, 12);
  ctx.font = 'bold 18px Orbitron, monospace';
  ctx.fillStyle = COLORS.TEXT;
  ctx.fillText(gs.highScore.toString(), DISPLAY.WIDTH - 16, 26);

  // Zone (top center)
  ctx.textAlign = 'center';
  ctx.font = '10px Orbitron, monospace';
  let zoneColor = 'rgba(255,255,255,0.4)';
  if (gs.currentZone >= 4) zoneColor = 'rgba(255,60,60,0.6)';
  else if (gs.currentZone === 3) zoneColor = 'rgba(180,80,255,0.6)';
  else if (gs.currentZone === 2) zoneColor = 'rgba(80,120,255,0.6)';
  ctx.fillStyle = zoneColor;
  ctx.fillText('ZONE ' + gs.currentZone, DISPLAY.WIDTH / 2, 12);

  // Gravity arrow near player
  if (gs.player.alive) {
    const p = gs.player;
    const arrowX = p.x + p.width + 14;
    const arrowY = p.y + p.height / 2;
    const pulse = 0.6 + 0.4 * Math.sin(gs.frameCount * 0.1);
    ctx.fillStyle = 'rgba(0,255,255,' + pulse + ')';
    ctx.font = '16px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gs.gravityFlipped ? '\u2191' : '\u2193', arrowX, arrowY);
  }

  ctx.restore();
}

function drawDeathFlashEffect() {
  const df = gs.deathFlash;
  if (!df.active) return;
  const alpha = 0.6 * (1 - df.timer / df.duration);
  ctx.fillStyle = 'rgba(255,50,50,' + alpha + ')';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
}

function drawStartScreen() {
  if (gs.screen !== 'start') return;

  // Overlay
  ctx.fillStyle = 'rgba(10,10,26,0.85)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  // Animated demo astronaut
  const demoX = DISPLAY.WIDTH * 0.2;
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;

  // Draw demo player
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#fff';
  ctx.fillStyle = COLORS.PLAYER;
  const dr = 4;
  const dw = PLAYER_CFG.SIZE;
  const dh = PLAYER_CFG.SIZE;
  const dx = demoX;
  const dy = gs.demoY;
  ctx.beginPath();
  ctx.moveTo(dx + dr, dy);
  ctx.lineTo(dx + dw - dr, dy);
  ctx.quadraticCurveTo(dx + dw, dy, dx + dw, dy + dr);
  ctx.lineTo(dx + dw, dy + dh - dr);
  ctx.quadraticCurveTo(dx + dw, dy + dh, dx + dw - dr, dy + dh);
  ctx.lineTo(dx + dr, dy + dh);
  ctx.quadraticCurveTo(dx, dy + dh, dx, dy + dh - dr);
  ctx.lineTo(dx, dy + dr);
  ctx.quadraticCurveTo(dx, dy, dx + dr, dy);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 3;
  ctx.shadowColor = COLORS.VISOR;
  ctx.fillStyle = COLORS.VISOR;
  ctx.fillRect(dx + dw * 0.3, dy + dh * 0.25, dw * 0.5, dh * 0.3);
  ctx.restore();

  // Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 20;
  ctx.shadowColor = COLORS.NEON_CYAN;
  ctx.fillStyle = COLORS.NEON_CYAN;
  ctx.font = 'bold 52px Orbitron, monospace';
  ctx.fillText('GRAVFLIP', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.32);

  ctx.shadowColor = COLORS.NEON_PINK;
  ctx.fillStyle = COLORS.NEON_PINK;
  ctx.font = 'bold 38px Orbitron, monospace';
  ctx.fillText('RUNNER', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.46);

  // Pulsing start text
  const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.06);
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'rgba(255,255,255,' + pulse + ')';
  ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.5) + ')';
  ctx.font = '16px Orbitron, monospace';
  ctx.fillText('PRESS SPACE OR TAP', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.64);

  // Best score
  if (gs.highScore > 0) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px Orbitron, monospace';
    ctx.fillText('BEST: ' + gs.highScore, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.76);
  }

  ctx.restore();
}

function drawPauseScreen() {
  if (gs.screen !== 'paused') return;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowBlur = 20;
  ctx.shadowColor = COLORS.NEON_CYAN;
  ctx.fillStyle = COLORS.NEON_CYAN;
  ctx.font = 'bold 44px Orbitron, monospace';
  ctx.fillText('PAUSED', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.4);

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.05);
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(255,255,255,' + pulse + ')';
  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  ctx.fillText('PRESS P OR ESC TO RESUME', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.55);

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('SCORE: ' + gs.score + '    BEST: ' + gs.highScore, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.68);

  ctx.restore();
}

function drawDeathScreen() {
  if (gs.screen !== 'dead') return;

  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Game Over
  ctx.shadowBlur = 20;
  ctx.shadowColor = COLORS.OBSTACLE;
  ctx.fillStyle = COLORS.OBSTACLE;
  ctx.font = 'bold 48px Orbitron, monospace';
  ctx.fillText('GAME OVER', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.3);

  // Score
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.TEXT;
  ctx.font = 'bold 28px Orbitron, monospace';
  ctx.fillText(gs.score.toString(), DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.46);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('SCORE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.39);

  // New best
  if (gs.newBest) {
    const sparkle = 0.7 + 0.3 * Math.sin(gs.frameCount * 0.12);
    ctx.shadowBlur = 12;
    ctx.shadowColor = COLORS.STAR;
    ctx.fillStyle = 'rgba(255,221,0,' + sparkle + ')';
    ctx.font = 'bold 20px Orbitron, monospace';
    ctx.fillText('\u2726 NEW BEST \u2726', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.58);
  }

  // Restart prompt
  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(255,255,255,' + pulse + ')';
  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  ctx.fillText('PRESS SPACE OR TAP TO RESTART', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.78);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  MAIN GAME LOOP
// ═══════════════════════════════════════════════════════════════
function gameLoop(timestamp) {
  if (lastTime === 0) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 16.667;
  if (dt > 3) dt = 3;
  lastTime = timestamp;

  // --- UPDATE ---
  if (gs.screen === 'playing' && gs.player.alive) {
    updatePlayer(dt);
    updateObstacles(dt);
    updateStars(dt);
    updateParticles(dt);
    updatePopups(dt);
    updateStarfield(dt);
    updateScreenShake(dt);
    updateDeathFlash(dt);
    updateZoneFlash(dt);

    // Coyote timer
    if (gs.coyoteTimer > 0) {
      gs.coyoteTimer -= dt * 16.67;
      if (gs.coyoteTimer <= 0) {
        gs.coyoteTimer = 0;
        // Check if still overlapping
        const p = gs.player;
        for (let i = 0; i < gs.obstacles.length; i++) {
          const o = gs.obstacles[i];
          if (aabbOverlap(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) {
            killPlayer();
            break;
          }
        }
      }
    }

    checkObstacleCollisions();
    checkStarCollisions();
    checkDangerWarning();

    // Score & distance
    gs.score += Math.floor(dt);
    gs.distanceTraveled += gs.speed * dt;

    // Zone milestone
    checkZoneMilestone();

    // Speed increase
    if (gs.speed < SPEED.MAX) {
      gs.speed += SPEED.INCREMENT * dt;
    }

    gs.frameCount++;

  } else if (gs.screen === 'playing' && !gs.player.alive) {
    // Death delay before showing death screen
    updateParticles(dt);
    updateScreenShake(dt);
    updateDeathFlash(dt);
    gs.deathDelay -= dt;
    gs.frameCount++;
    if (gs.deathDelay <= 0) {
      gs.screen = 'dead';
      document.body.classList.remove('game-running');
      updateTapZoneVisibility();
    }
  } else if (gs.screen === 'start') {
    // Animate demo astronaut
    const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
    const ceilY = DISPLAY.FLOOR_HEIGHT;
    gs.demoVy += gs.demoFlipped ? -0.35 : 0.35;
    gs.demoY += gs.demoVy;
    if (gs.demoY + PLAYER_CFG.SIZE >= floorY) {
      gs.demoY = floorY - PLAYER_CFG.SIZE;
      gs.demoVy = -8;
      gs.demoFlipped = !gs.demoFlipped;
    }
    if (gs.demoY <= ceilY) {
      gs.demoY = ceilY;
      gs.demoVy = 8;
      gs.demoFlipped = !gs.demoFlipped;
    }
    updateStarfield(dt);
    gs.frameCount++;
  } else if (gs.screen === 'paused') {
    gs.frameCount++;
  } else if (gs.screen === 'dead') {
    updateParticles(dt);
    gs.frameCount++;
  }

  // --- DRAW ---
  ctx.save();

  // Screen shake
  if (gs.screenShake.active) {
    const si = gs.screenShake.intensity;
    ctx.translate(
      (Math.random() - 0.5) * si * 2,
      (Math.random() - 0.5) * si * 2
    );
  }

  drawBackground();
  drawSpeedLines();
  drawFloorAndCeiling();
  drawObstacles();
  drawStars();
  drawTrail();
  drawPlayer();
  drawParticles();
  drawPopups();
  drawDangerVignette();
  drawVignette();
  drawHUD();
  drawDeathFlashEffect();

  ctx.restore();

  // Overlay screens (drawn without shake)
  drawStartScreen();
  drawPauseScreen();
  drawDeathScreen();

  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
requestAnimationFrame(gameLoop);
