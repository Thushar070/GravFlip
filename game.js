// @license PROPRIETARY — All rights reserved. Do not copy or reuse.

// ═══════════════════════════════════════════════════════════════
//  CONFIG — split into grouped objects
// ═══════════════════════════════════════════════════════════════
const DISPLAY = { WIDTH: 800, HEIGHT: 450, FLOOR_HEIGHT: 24 };

const PHYSICS = { GRAVITY: 0.5, JUMP_FORCE: -12, MAX_VY: 10 };

const SPEED = { INITIAL: 3, MAX: 8, INCREMENT: 0.0005 };

const PLAYER_CFG = { SIZE: 22, TRAIL_LEN: 8, SQUISH_FRAMES: 12 };

const GAMEPLAY = {
  MIN_GAP: 130, STAR_POINTS: 50, COYOTE_TIME: 80,
  DANGER_DISTANCE: 40, ZONE_THRESHOLD: 1000,
  OBSTACLE_MIN_W: 28, OBSTACLE_MAX_W: 40,
  GAP_MIN: 220, GAP_MAX: 400,
  STAR_RADIUS: 14, COYOTE_EDGE_PX: 4
};

const COLORS = {
  BG: '#0a0a1a', FLOOR: '#1a1a4a', FLOOR_GLOW: '#4444ff',
  OBSTACLE: '#ff3333', OBSTACLE_GLOW: '#ff6666',
  STAR: '#ffdd00', PLAYER: '#ffffff', VISOR: '#88ccff',
  TRAIL: '#4488ff', TEXT: '#ffffff',
  NEON_PINK: '#ff44aa', NEON_CYAN: '#00ffff',
  NEON_ORANGE: '#ff8800'
};

const PARTICLE_CFG = {
  DEATH_COUNT: 18, DEATH_SPEED_MIN: 2, DEATH_SPEED_MAX: 6,
  DEATH_LIFE_MIN: 40, DEATH_LIFE_MAX: 60,
  STAR_COUNT: 8, STAR_SPEED_MIN: 1, STAR_SPEED_MAX: 3, STAR_LIFE: 20
};

const AUDIO_CFG = {
  DRONE_FREQ: 55, DRONE_GAIN: 0.03,
  FLIP_FREQ_START: 300, FLIP_FREQ_END: 600, FLIP_DURATION: 0.08,
  COLLECT_FREQ_A: 523, COLLECT_FREQ_B: 659, COLLECT_DURATION: 0.12,
  DEATH_DURATION: 0.3, DEATH_FILTER_FREQ: 400
};

const STARFIELD_COUNT = 100;
const NEBULA_COUNT = 3;

const CONFIG = {
  WIDTH: DISPLAY.WIDTH, HEIGHT: DISPLAY.HEIGHT,
  PLAYER_SIZE: PLAYER_CFG.SIZE, GRAVITY: PHYSICS.GRAVITY,
  JUMP_FORCE: PHYSICS.JUMP_FORCE, INITIAL_SPEED: SPEED.INITIAL,
  MAX_SPEED: SPEED.MAX, SPEED_INCREMENT: SPEED.INCREMENT,
  FLOOR_HEIGHT: DISPLAY.FLOOR_HEIGHT, MIN_GAP: GAMEPLAY.MIN_GAP,
  STAR_POINTS: GAMEPLAY.STAR_POINTS, COYOTE_TIME: GAMEPLAY.COYOTE_TIME,
  DANGER_DISTANCE: GAMEPLAY.DANGER_DISTANCE, COLORS: COLORS
};

const ARPEGGIO_NOTES = [130.81, 164.81, 196.0, 246.94];

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
  if (cw / ch > ar) { h = ch; w = h * ar; }
  else { w = cw; h = w / ar; }
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
let arpeggioTimer = null;
let arpeggioStep = 0;
let speedWarningOsc = null;
let speedWarningGain = null;

function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { /* silent */ }
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
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + AUDIO_CFG.FLIP_DURATION + 0.01);
}

function collectSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = AUDIO_CFG.COLLECT_DURATION;
  [AUDIO_CFG.COLLECT_FREQ_A, AUDIO_CFG.COLLECT_FREQ_B].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.005);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t + i * 0.04); o.stop(t + dur + 0.02);
  });
}

function deathSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = AUDIO_CFG.DEATH_DURATION;
  const bufSz = audioCtx.sampleRate * dur;
  const buf = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSz; i++) d[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const flt = audioCtx.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.setValueAtTime(AUDIO_CFG.DEATH_FILTER_FREQ, t);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur + 0.01);
}

function startDrone() {
  if (!audioCtx) return; stopDrone();
  droneOsc = audioCtx.createOscillator();
  droneGain = audioCtx.createGain();
  droneOsc.type = 'sine';
  droneOsc.frequency.setValueAtTime(AUDIO_CFG.DRONE_FREQ, audioCtx.currentTime);
  droneGain.gain.setValueAtTime(AUDIO_CFG.DRONE_GAIN, audioCtx.currentTime);
  droneOsc.connect(droneGain); droneGain.connect(audioCtx.destination);
  droneOsc.start();
}

function stopDrone() {
  if (droneOsc) { try { droneOsc.stop(); } catch (e) {} droneOsc = null; droneGain = null; }
}

function landingThud() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(80, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.001);
  g.gain.linearRampToValueAtTime(0, t + 0.06);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.07);
}

function zoneChangeSting() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const notes = [523, 659, 784];
  const delay = audioCtx.createDelay(0.3);
  delay.delayTime.setValueAtTime(0.15, t);
  const fb = audioCtx.createGain();
  fb.gain.setValueAtTime(0.2, t);
  delay.connect(fb); fb.connect(delay); delay.connect(audioCtx.destination);
  notes.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t + i * 0.1);
    g.gain.setValueAtTime(0, t + i * 0.1);
    g.gain.linearRampToValueAtTime(0.12, t + i * 0.1 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.1 + 0.2);
    o.connect(g); g.connect(audioCtx.destination); g.connect(delay);
    o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.25);
  });
}

function playArpeggioNote() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(ARPEGGIO_NOTES[arpeggioStep % 4], t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.02);
  g.gain.linearRampToValueAtTime(0, t + 0.35);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.4);
  arpeggioStep++;
}

function startArpeggio() {
  if (!audioCtx) return; stopArpeggio();
  arpeggioStep = 0;
  playArpeggioNote();
  arpeggioTimer = setInterval(playArpeggioNote, 400);
}

function stopArpeggio() {
  if (arpeggioTimer) { clearInterval(arpeggioTimer); arpeggioTimer = null; }
}

function startSpeedWarning() {
  if (!audioCtx || speedWarningOsc) return;
  speedWarningOsc = audioCtx.createOscillator();
  speedWarningGain = audioCtx.createGain();
  speedWarningOsc.type = 'sine';
  speedWarningOsc.frequency.setValueAtTime(880, audioCtx.currentTime);
  speedWarningGain.gain.setValueAtTime(0, audioCtx.currentTime);
  speedWarningGain.gain.linearRampToValueAtTime(0.015, audioCtx.currentTime + 1);
  speedWarningOsc.connect(speedWarningGain);
  speedWarningGain.connect(audioCtx.destination);
  speedWarningOsc.start();
}

function stopSpeedWarning() {
  if (speedWarningOsc) {
    try { speedWarningOsc.stop(); } catch (e) {}
    speedWarningOsc = null; speedWarningGain = null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════════
function loadHighScore(mode) {
  const k = 'gravflip_best_' + (mode || 'classic');
  try { return parseInt(localStorage.getItem(k) || '0', 10); } catch (e) { return 0; }
}
function saveHighScore(mode, s) {
  try { localStorage.setItem('gravflip_best_' + mode, s.toString()); } catch (e) {}
}
function loadBestOverall() {
  let b = 0;
  ['classic', 'mirror', 'blitz'].forEach(m => {
    const s = loadHighScore(m); if (s > b) b = s;
  });
  try { const l = parseInt(localStorage.getItem('gravflip_best') || '0', 10); if (l > b) b = l; }
  catch (e) {}
  return b;
}

function createStarfield() {
  const a = [];
  for (let i = 0; i < STARFIELD_COUNT; i++) {
    a.push({
      x: Math.random() * DISPLAY.WIDTH, y: Math.random() * DISPLAY.HEIGHT,
      size: 0.5 + Math.random() * 2, brightness: 0.3 + Math.random() * 0.7,
      speed: 0.1 + Math.random() * 0.4
    });
  }
  return a;
}

function createNebulas() {
  return [
    { x: 200, y: 150, rx: 150, ry: 100, color: 'rgba(60,40,150,', baseOpacity: 0.06, opacity: 0.06, speed: 0.08, phase: 0 },
    { x: 500, y: 300, rx: 120, ry: 80, color: 'rgba(150,40,100,', baseOpacity: 0.05, opacity: 0.05, speed: 0.06, phase: 2 },
    { x: 700, y: 180, rx: 100, ry: 120, color: 'rgba(40,120,120,', baseOpacity: 0.04, opacity: 0.04, speed: 0.05, phase: 4 }
  ];
}

function createPlayer(xFraction, onCeiling) {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  return {
    x: DISPLAY.WIDTH * xFraction - PLAYER_CFG.SIZE / 2,
    y: onCeiling ? ceilY : floorY - PLAYER_CFG.SIZE,
    vy: 0, width: PLAYER_CFG.SIZE, height: PLAYER_CFG.SIZE,
    trail: [], alive: true, squishTimer: 0, squishDirection: 1,
    grounded: true, wasGrounded: true
  };
}

function createInitialState() {
  return {
    screen: 'start',
    mode: 'classic',
    modeSelectIndex: 0,
    score: 0,
    highScore: 0,
    speed: SPEED.INITIAL,
    frameCount: 0,
    gravityFlipped: false,
    distanceTraveled: 0,
    currentZone: 1,
    comboCount: 0,
    coyoteTimer: 0,
    dangerWarning: false,
    player: createPlayer(0.2, false),
    player2: null,
    obstacles: [],
    stars: [],
    particles: [],
    popups: [],
    starfield: createStarfield(),
    nebulas: createNebulas(),
    starbursts: [],
    ghostStars: [],
    ripples: [],
    screenShake: { active: false, intensity: 0, duration: 0, timer: 0 },
    deathFlash: { active: false, timer: 0, duration: 15 },
    zoneFlash: { active: false, timer: 0, duration: 90, label: '' },
    zoneWipe: { active: false, timer: 0, duration: 30, color: '', label: '' },
    floorPulseTimer: 0,
    ceilingPulseTimer: 0,
    engineFlashTimer: 0,
    pausedAt: 0,
    nextObstacleX: DISPLAY.WIDTH + 200,
    deathDelay: 0,
    newBest: false,
    demoY: DISPLAY.HEIGHT / 2,
    demoVy: -2,
    demoFlipped: false,
    gridOffset: 0,
    speedWarningActive: false,
    maxSpeedFlashTimer: 0,
    modeStats: {
      playTimeMs: 0, starsCollected: 0,
      whoDied: null, syncFlips: 0,
      maxSpeedReached: 0, zonesCleared: 0
    }
  };
}

let gs = createInitialState();
let lastTime = 0;
let touchStartX = 0;

// ═══════════════════════════════════════════════════════════════
//  MOBILE SETUP
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
    e.preventDefault(); e.stopPropagation();
    handleInput();
  }, { passive: false });
}

function updateTapZoneVisibility() {
  if (!tapZone) return;
  if (gs.screen === 'playing' || gs.screen === 'paused') {
    tapZone.classList.remove('hidden');
    tapZone.classList.remove('mode-blitz', 'mode-mirror');
    if (gs.mode === 'blitz') tapZone.classList.add('mode-blitz');
    else if (gs.mode === 'mirror') tapZone.classList.add('mode-mirror');
  } else {
    tapZone.classList.add('hidden');
  }
}

document.body.style.overflow = 'hidden';
document.body.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleCollide(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return (dx * dx + dy * dy) < (r * r);
}

// ═══════════════════════════════════════════════════════════════
//  GRAVITY FLIP
// ═══════════════════════════════════════════════════════════════
function flipGravity() {
  gs.gravityFlipped = !gs.gravityFlipped;
  const p = gs.player;
  p.squishTimer = PLAYER_CFG.SQUISH_FRAMES;
  p.squishDirection = gs.gravityFlipped ? -1 : 1;
  p.vy = gs.gravityFlipped ? PHYSICS.JUMP_FORCE : -PHYSICS.JUMP_FORCE;
  p.grounded = false;

  if (gs.mode === 'mirror' && gs.player2 && gs.player2.alive) {
    const p2 = gs.player2;
    p2.squishTimer = PLAYER_CFG.SQUISH_FRAMES;
    p2.squishDirection = gs.gravityFlipped ? 1 : -1;
    p2.vy = gs.gravityFlipped ? -PHYSICS.JUMP_FORCE : PHYSICS.JUMP_FORCE;
    p2.grounded = false;
    gs.modeStats.syncFlips++;
  }

  flipSound();
  gs.engineFlashTimer = 6;
  if (gs.coyoteTimer > 0) gs.coyoteTimer = 0;

  // Floor/ceiling pulse
  if (gs.gravityFlipped) gs.ceilingPulseTimer = 20;
  else gs.floorPulseTimer = 20;
}

// ═══════════════════════════════════════════════════════════════
//  PAUSE SYSTEM
// ═══════════════════════════════════════════════════════════════
function pauseGame() {
  gs.screen = 'paused'; gs.pausedAt = performance.now();
  stopDrone(); stopSpeedWarning(); updateTapZoneVisibility();
}

function resumeGame() {
  const pd = performance.now() - gs.pausedAt;
  lastTime += pd; gs.screen = 'playing';
  startDrone();
  if (gs.mode === 'blitz' && gs.speed > 12) startSpeedWarning();
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
  const gapMult = gs.mode === 'blitz' ? 0.8 : 1;
  const minGap = GAMEPLAY.MIN_GAP * gapMult;
  const maxH = playH - minGap;
  const h = 40 + Math.random() * Math.max(1, maxH - 40);
  const x = gs.nextObstacleX;
  const y = fromFloor ? floorY - h : ceilY;

  gs.obstacles.push({ x, y, width: w, height: h, fromFloor, glowPhase: Math.random() * Math.PI * 2 });

  const gapReduction = Math.max(0, (gs.currentZone - 1) * 15);
  const gMin = GAMEPLAY.GAP_MIN * gapMult;
  const gMax = GAMEPLAY.GAP_MAX * gapMult;
  const gap = Math.max(gMin * 0.7, gMin + Math.random() * (gMax - gMin) - gapReduction);
  gs.nextObstacleX = x + gap;

  if (Math.random() > 0.35) {
    let sY;
    if (fromFloor) sY = ceilY + 20 + Math.random() * Math.max(1, y - ceilY - 40);
    else sY = (y + h + 20) + Math.random() * Math.max(1, floorY - y - h - 40);
    sY = Math.max(ceilY + 15, Math.min(floorY - 15, sY));
    gs.stars.push({
      x: x + w / 2 + (Math.random() - 0.5) * 60, y: sY,
      radius: GAMEPLAY.STAR_RADIUS, phase: Math.random() * Math.PI * 2
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  PARTICLES, STARBURSTS, GHOSTS, RIPPLES
// ═══════════════════════════════════════════════════════════════
function emitDeathParticles(cx, cy) {
  const cols = [COLORS.NEON_PINK, COLORS.NEON_CYAN, COLORS.STAR, COLORS.OBSTACLE];
  for (let i = 0; i < PARTICLE_CFG.DEATH_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = PARTICLE_CFG.DEATH_SPEED_MIN + Math.random() * (PARTICLE_CFG.DEATH_SPEED_MAX - PARTICLE_CFG.DEATH_SPEED_MIN);
    const life = PARTICLE_CFG.DEATH_LIFE_MIN + Math.random() * (PARTICLE_CFG.DEATH_LIFE_MAX - PARTICLE_CFG.DEATH_LIFE_MIN);
    gs.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, color: cols[Math.floor(Math.random() * cols.length)], size: 2 + Math.random() * 3 });
  }
}

function emitStarParticles(cx, cy) {
  for (let i = 0; i < PARTICLE_CFG.STAR_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = PARTICLE_CFG.STAR_SPEED_MIN + Math.random() * (PARTICLE_CFG.STAR_SPEED_MAX - PARTICLE_CFG.STAR_SPEED_MIN);
    gs.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: PARTICLE_CFG.STAR_LIFE, maxLife: PARTICLE_CFG.STAR_LIFE, color: COLORS.STAR, size: 1.5 + Math.random() * 2 });
  }
}

function emitStarburst(x, y) {
  gs.starbursts.push({ x, y, radius: 0, maxRadius: 30, timer: 0, duration: 20 });
}

function emitGhostStar(x, y) {
  gs.ghostStars.push({ x, y, timer: 0, duration: 20, radius: 6 });
}

function emitRipple(x, y) {
  gs.ripples.push({ x, y, width: 0, maxWidth: 80, timer: 0, duration: 25 });
}

// ═══════════════════════════════════════════════════════════════
//  POPUPS & COMBO
// ═══════════════════════════════════════════════════════════════
function spawnPopup(text, x, y, color, size) {
  gs.popups.push({ text, x, y, vy: -1.2, life: 60, maxLife: 60, color: color || COLORS.NEON_CYAN, size: size || 22 });
}

function getComboMultiplier() {
  const c = gs.comboCount;
  if (c >= 8) return 4; if (c >= 5) return 3; if (c >= 3) return 2; return 1;
}

function checkComboMilestone() {
  const c = gs.comboCount, p = gs.player;
  if (c === 3) spawnPopup('COMBO x2!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 22);
  else if (c === 5) spawnPopup('COMBO x3!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 22);
  else if (c === 8) spawnPopup('COMBO x4!', p.x + 30, p.y - 20, COLORS.NEON_CYAN, 24);
}

// ═══════════════════════════════════════════════════════════════
//  DEATH, RESET, MODE SELECT
// ═══════════════════════════════════════════════════════════════
function killPlayer(who) {
  const tgt = (who === 'p2' && gs.player2) ? gs.player2 : gs.player;
  tgt.alive = false;
  if (gs.mode === 'mirror') gs.modeStats.whoDied = who || 'p1';
  emitDeathParticles(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2);
  gs.comboCount = 0;
  gs.screenShake = { active: true, intensity: 8, duration: 400, timer: 0 };
  gs.deathFlash = { active: true, timer: 0, duration: 15 };
  deathSound(); stopDrone(); stopSpeedWarning();
  gs.deathDelay = 48;
  gs.newBest = false;
  if (gs.score > gs.highScore) {
    gs.highScore = gs.score;
    saveHighScore(gs.mode, gs.highScore);
    gs.newBest = true;
  }
}

function confirmModeSelection() {
  const modes = ['classic', 'mirror', 'blitz'];
  const sel = modes[gs.modeSelectIndex];
  stopArpeggio();

  const sf = gs.starfield;
  const neb = gs.nebulas;
  const fc = gs.frameCount;
  const idx = gs.modeSelectIndex;

  gs = createInitialState();
  gs.mode = sel;
  gs.modeSelectIndex = idx;
  gs.highScore = loadHighScore(sel);
  gs.starfield = sf;
  gs.nebulas = neb;
  gs.frameCount = fc;
  gs.screen = 'playing';
  gs.player.alive = true;
  gs.modeStats.playTimeMs = 0;

  if (sel === 'blitz') gs.speed = 5;
  if (sel === 'mirror') gs.player2 = createPlayer(0.8, true);

  updateNebulaColors();
  startDrone();
  document.body.classList.add('game-running');
  updateTapZoneVisibility();
}

function handleInput() {
  switch (gs.screen) {
    case 'start':
      initAudio();
      gs.screen = 'modeselect';
      startArpeggio();
      break;
    case 'modeselect':
      confirmModeSelection();
      break;
    case 'playing':
      flipGravity();
      break;
    case 'paused':
      resumeGame();
      break;
    case 'dead':
      gs.screen = 'modeselect';
      document.body.classList.remove('game-running');
      initAudio();
      startArpeggio();
      break;
  }
}

function handlePauseToggle() {
  if (gs.screen === 'playing') pauseGame();
  else if (gs.screen === 'paused') resumeGame();
}

// ═══════════════════════════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (gs.screen === 'modeselect') {
    if (e.code === 'ArrowLeft') { e.preventDefault(); if (gs.modeSelectIndex > 0) gs.modeSelectIndex--; return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); if (gs.modeSelectIndex < 2) gs.modeSelectIndex++; return; }
  }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleInput(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); handlePauseToggle(); }
});

cvs.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
  if (gs.screen !== 'modeselect') handleInput();
}, { passive: false });

cvs.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (gs.screen === 'modeselect') {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && gs.modeSelectIndex < 2) gs.modeSelectIndex++;
      else if (dx > 0 && gs.modeSelectIndex > 0) gs.modeSelectIndex--;
    } else {
      confirmModeSelection();
    }
  }
}, { passive: false });

cvs.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(); });

// ═══════════════════════════════════════════════════════════════
//  UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function updateSinglePlayer(p, isP2, dt) {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  const gravFlip = isP2 ? !gs.gravityFlipped : gs.gravityFlipped;

  p.wasGrounded = p.grounded;

  if (gravFlip) p.vy -= PHYSICS.GRAVITY * dt;
  else p.vy += PHYSICS.GRAVITY * dt;

  if (p.vy > PHYSICS.MAX_VY) p.vy = PHYSICS.MAX_VY;
  if (p.vy < -PHYSICS.MAX_VY) p.vy = -PHYSICS.MAX_VY;

  p.y += p.vy * dt;
  p.grounded = false;

  if (p.y + p.height >= floorY) { p.y = floorY - p.height; p.vy = 0; p.grounded = true; }
  if (p.y <= ceilY) { p.y = ceilY; p.vy = 0; p.grounded = true; }

  if (p.grounded && !p.wasGrounded) {
    landingThud();
    const landY = p.y <= ceilY + 1 ? ceilY : floorY;
    emitRipple(p.x + p.width / 2, landY);
  }

  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > PLAYER_CFG.TRAIL_LEN) p.trail.shift();
  if (p.squishTimer > 0) p.squishTimer -= dt;
}

function updateObstacles(dt) {
  const spd = gs.speed * dt;
  for (let i = gs.obstacles.length - 1; i >= 0; i--) {
    gs.obstacles[i].x -= spd;
    gs.obstacles[i].glowPhase += 0.05 * dt;
    if (gs.obstacles[i].x + gs.obstacles[i].width < -50) gs.obstacles.splice(i, 1);
  }
  while (gs.nextObstacleX < DISPLAY.WIDTH + 400) generateObstacle();
  gs.nextObstacleX -= spd;
}

function updateStars(dt) {
  const spd = gs.speed * dt;
  for (let i = gs.stars.length - 1; i >= 0; i--) {
    gs.stars[i].x -= spd; gs.stars[i].phase += 0.06 * dt;
    if (gs.stars[i].x < -30) gs.stars.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const pt = gs.particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
    if (pt.life <= 0) gs.particles.splice(i, 1);
  }
}

function updateStarbursts(dt) {
  for (let i = gs.starbursts.length - 1; i >= 0; i--) {
    const sb = gs.starbursts[i];
    sb.timer += dt; sb.radius = (sb.timer / sb.duration) * sb.maxRadius;
    sb.x -= gs.speed * dt;
    if (sb.timer >= sb.duration) gs.starbursts.splice(i, 1);
  }
}

function updateGhostStars(dt) {
  for (let i = gs.ghostStars.length - 1; i >= 0; i--) {
    const g = gs.ghostStars[i];
    g.timer += dt; g.x -= gs.speed * dt;
    if (g.timer >= g.duration) gs.ghostStars.splice(i, 1);
  }
}

function updateRipples(dt) {
  for (let i = gs.ripples.length - 1; i >= 0; i--) {
    const r = gs.ripples[i];
    r.timer += dt; r.width = (r.timer / r.duration) * r.maxWidth;
    if (r.timer >= r.duration) gs.ripples.splice(i, 1);
  }
}

function updatePopups(dt) {
  for (let i = gs.popups.length - 1; i >= 0; i--) {
    const pp = gs.popups[i]; pp.y += pp.vy * dt; pp.life -= dt;
    if (pp.life <= 0) gs.popups.splice(i, 1);
  }
}

function updateStarfield(dt) {
  const spd = gs.speed * 0.2;
  for (let i = 0; i < gs.starfield.length; i++) {
    const s = gs.starfield[i];
    s.x -= s.speed * spd * dt;
    if (s.x < 0) { s.x = DISPLAY.WIDTH; s.y = Math.random() * DISPLAY.HEIGHT; }
  }
}

function updateNebulas(dt) {
  for (let i = 0; i < gs.nebulas.length; i++) {
    const n = gs.nebulas[i];
    n.x -= n.speed * gs.speed * dt * 0.1;
    n.phase += 0.01 * dt;
    n.opacity = Math.max(0, n.baseOpacity + 0.02 * Math.sin(n.phase));
    if (n.x + n.rx < -50) {
      n.x = DISPLAY.WIDTH + n.rx + Math.random() * 200;
      n.y = Math.random() * DISPLAY.HEIGHT;
    }
  }
}

function updateNebulaColors() {
  const z = gs.currentZone;
  if (z <= 1) {
    gs.nebulas[0].color = 'rgba(60,40,150,';
    gs.nebulas[1].color = 'rgba(150,40,100,';
    gs.nebulas[2].color = 'rgba(40,120,120,';
  } else if (z === 2) {
    gs.nebulas[0].color = 'rgba(40,60,180,';
    gs.nebulas[1].color = 'rgba(80,60,160,';
    gs.nebulas[2].color = 'rgba(40,100,160,';
  } else if (z === 3) {
    gs.nebulas[0].color = 'rgba(100,40,180,';
    gs.nebulas[1].color = 'rgba(140,30,140,';
    gs.nebulas[2].color = 'rgba(80,40,160,';
  } else {
    gs.nebulas[0].color = 'rgba(160,30,60,';
    gs.nebulas[1].color = 'rgba(180,40,40,';
    gs.nebulas[2].color = 'rgba(140,40,60,';
  }
}

function updateScreenShake(dt) {
  const ss = gs.screenShake;
  if (!ss.active) return;
  ss.timer += dt * 16.67;
  if (ss.timer >= ss.duration) { ss.active = false; ss.intensity = 0; }
  else ss.intensity = 8 * (1 - ss.timer / ss.duration);
}

function updateDeathFlash(dt) {
  const df = gs.deathFlash;
  if (!df.active) return;
  df.timer += dt; if (df.timer >= df.duration) df.active = false;
}

function updateZoneWipe(dt) {
  if (!gs.zoneWipe.active) return;
  gs.zoneWipe.timer += dt;
  if (gs.zoneWipe.timer >= gs.zoneWipe.duration) gs.zoneWipe.active = false;
}

function updateFloorPulse(dt) {
  if (gs.floorPulseTimer > 0) gs.floorPulseTimer -= dt;
  if (gs.ceilingPulseTimer > 0) gs.ceilingPulseTimer -= dt;
}

function updateEngineFlash(dt) {
  if (gs.engineFlashTimer > 0) gs.engineFlashTimer -= dt;
}

function checkPlayerObstacleCollision(p, who) {
  if (!p.alive) return;
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    if (aabbOverlap(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) {
      const overlapX = Math.min(p.x + p.width, o.x + o.width) - Math.max(p.x, o.x);
      if (overlapX <= GAMEPLAY.COYOTE_EDGE_PX && gs.coyoteTimer <= 0) {
        gs.coyoteTimer = GAMEPLAY.COYOTE_TIME; return;
      }
      if (gs.coyoteTimer > 0 && overlapX <= GAMEPLAY.COYOTE_EDGE_PX) return;
      killPlayer(who); return;
    }
  }
}

function checkObstacleCollisions() {
  checkPlayerObstacleCollision(gs.player, 'p1');
  if (gs.mode === 'mirror' && gs.player2 && gs.player2.alive) {
    checkPlayerObstacleCollision(gs.player2, 'p2');
  }
}

function checkStarCollisions() {
  const players = [{ p: gs.player, isP2: false }];
  if (gs.mode === 'mirror' && gs.player2 && gs.player2.alive) {
    players.push({ p: gs.player2, isP2: true });
  }
  for (let i = gs.stars.length - 1; i >= 0; i--) {
    const s = gs.stars[i];
    for (const { p } of players) {
      if (!p.alive) continue;
      const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
      if (circleCollide(pcx, pcy, s.x, s.y, s.radius)) {
        emitStarParticles(s.x, s.y);
        emitStarburst(s.x, s.y);
        emitGhostStar(s.x, s.y);
        gs.comboCount++;
        const mult = getComboMultiplier();
        const starMult = gs.mode === 'blitz' ? 2 : 1;
        const pts = GAMEPLAY.STAR_POINTS * mult * starMult;
        gs.score += pts;
        gs.modeStats.starsCollected++;
        spawnPopup('+' + pts, s.x, s.y - 10, COLORS.STAR, 18);
        checkComboMilestone();
        collectSound();
        gs.stars.splice(i, 1);
        break;
      }
    }
  }
}

function checkDangerWarning() {
  const p = gs.player;
  gs.dangerWarning = false;
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    const dist = o.x - (p.x + p.width);
    if (dist > -p.width && dist < GAMEPLAY.DANGER_DISTANCE) { gs.dangerWarning = true; return; }
  }
}

function checkZoneMilestone() {
  const threshold = gs.mode === 'blitz' ? 500 : GAMEPLAY.ZONE_THRESHOLD;
  const newZone = 1 + Math.floor(gs.score / threshold);
  if (newZone > gs.currentZone) {
    gs.modeStats.zonesCleared = newZone - 1;
    gs.currentZone = newZone;
    const label = '\u2014 ZONE ' + gs.currentZone + ' \u2014';
    const zoneColors = { 2: 'rgba(60,60,200,0.3)', 3: 'rgba(140,40,180,0.3)' };
    const wipeColor = zoneColors[gs.currentZone] || 'rgba(180,40,40,0.3)';
    gs.zoneWipe = { active: true, timer: 0, duration: 30, color: wipeColor, label };
    spawnPopup(label, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2 - 20, COLORS.NEON_PINK, 36);
    updateNebulaColors();
    zoneChangeSting();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function drawBackground() {
  ctx.fillStyle = COLORS.BG;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  if (gs.currentZone > 1) {
    let tc;
    if (gs.currentZone === 2) tc = 'rgba(30,30,120,0.08)';
    else if (gs.currentZone === 3) tc = 'rgba(80,20,100,0.08)';
    else tc = 'rgba(100,20,20,0.08)';
    ctx.fillStyle = tc;
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  }
}

function drawNebulas() {
  ctx.save();
  for (let i = 0; i < gs.nebulas.length; i++) {
    const n = gs.nebulas[i];
    const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry));
    grd.addColorStop(0, n.color + n.opacity + ')');
    grd.addColorStop(1, n.color + '0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(n.x, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStarfieldBg() {
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
    const sx = Math.random() * DISPLAY.WIDTH * 0.3;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + DISPLAY.WIDTH * (0.4 + Math.random() * 0.6), y);
    ctx.stroke();
  }
}

function drawFloorAndCeiling() {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  ctx.save();
  const floorGlow = 15 + (gs.floorPulseTimer > 0 ? gs.floorPulseTimer * 0.75 : 0);
  const ceilGlow = 15 + (gs.ceilingPulseTimer > 0 ? gs.ceilingPulseTimer * 0.75 : 0);

  // Floor
  ctx.shadowBlur = floorGlow; ctx.shadowColor = COLORS.FLOOR_GLOW;
  ctx.fillStyle = COLORS.FLOOR;
  ctx.fillRect(0, floorY, DISPLAY.WIDTH, DISPLAY.FLOOR_HEIGHT);
  ctx.fillStyle = COLORS.FLOOR_GLOW;
  ctx.fillRect(0, floorY, DISPLAY.WIDTH, 2);

  // Ceiling
  ctx.shadowBlur = ceilGlow; ctx.shadowColor = COLORS.FLOOR_GLOW;
  ctx.fillStyle = COLORS.FLOOR;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.FLOOR_HEIGHT);
  ctx.fillStyle = COLORS.FLOOR_GLOW;
  ctx.fillRect(0, DISPLAY.FLOOR_HEIGHT - 2, DISPLAY.WIDTH, 2);
  ctx.restore();
}

function drawFloorGrid() {
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const spacing = 60;
  const offset = gs.gridOffset % spacing;
  ctx.save();
  ctx.strokeStyle = 'rgba(68,68,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = -offset; x < DISPLAY.WIDTH; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, DISPLAY.HEIGHT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, DISPLAY.FLOOR_HEIGHT); ctx.stroke();
  }
  ctx.restore();
}

function drawObstacleTrails() {
  ctx.save();
  const alphas = [0.15, 0.08, 0.03];
  const offsets = [8, 16, 24];
  const isMaxBlitz = gs.mode === 'blitz' && gs.speed >= 14;
  const baseColor = isMaxBlitz ? '255,136,0' : '255,80,80';
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    for (let t = 0; t < 3; t++) {
      ctx.fillStyle = 'rgba(' + baseColor + ',' + alphas[t] + ')';
      ctx.fillRect(o.x + offsets[t], o.y, o.width, o.height);
    }
  }
  ctx.restore();
}

function drawObstacles() {
  ctx.save();
  const isMaxBlitz = gs.mode === 'blitz' && gs.speed >= 14;
  const obsColor = isMaxBlitz ? COLORS.NEON_ORANGE : COLORS.OBSTACLE;
  const glowColor = isMaxBlitz ? '#ffaa44' : COLORS.OBSTACLE_GLOW;
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    const glow = 8 + 4 * Math.sin(o.glowPhase);
    ctx.shadowBlur = glow; ctx.shadowColor = glowColor;
    ctx.fillStyle = obsColor;
    ctx.fillRect(o.x, o.y, o.width, o.height);

    ctx.fillStyle = glowColor;
    const sH = 8, sW = o.width / 4;
    if (o.fromFloor) {
      for (let s = 0; s < 4; s++) {
        const sx = o.x + s * sW;
        ctx.beginPath(); ctx.moveTo(sx, o.y); ctx.lineTo(sx + sW / 2, o.y - sH); ctx.lineTo(sx + sW, o.y); ctx.closePath(); ctx.fill();
      }
    } else {
      const bot = o.y + o.height;
      for (let s = 0; s < 4; s++) {
        const sx = o.x + s * sW;
        ctx.beginPath(); ctx.moveTo(sx, bot); ctx.lineTo(sx + sW / 2, bot + sH); ctx.lineTo(sx + sW, bot); ctx.closePath(); ctx.fill();
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
    ctx.shadowBlur = 10; ctx.shadowColor = COLORS.STAR;
    ctx.fillStyle = COLORS.STAR;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTrailFor(p, color) {
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    const alpha = ((i + 1) / p.trail.length) * 0.35;
    const size = p.width * ((i + 1) / p.trail.length) * 0.7;
    ctx.fillStyle = color.replace('1)', alpha + ')');
    ctx.fillRect(t.x - size * 0.1, t.y + (p.height - size) / 2, size * 0.6, size);
  }
}

function drawEngineGlow(p, isP2) {
  if (!p.alive) return;
  ctx.save();
  const cx = p.x + p.width / 2;
  const flameBelow = isP2 ? gs.gravityFlipped : !gs.gravityFlipped;
  let ey, dir;
  if (flameBelow) { ey = p.y + p.height; dir = 1; }
  else { ey = p.y; dir = -1; }

  const flickerH = 6 + (Math.random() * 6 - 3);
  const flashMult = gs.engineFlashTimer > 0 ? 2 : 1;
  const h = Math.abs(flickerH) * flashMult;

  const colors = isP2
    ? ['rgba(255,68,170,0.6)', 'rgba(255,150,200,0.4)', 'rgba(255,255,255,0.3)']
    : ['rgba(255,136,0,0.6)', 'rgba(255,221,0,0.4)', 'rgba(255,255,255,0.3)'];
  const widths = [5, 3.5, 2];

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.ellipse(cx, ey + dir * h * (0.3 + i * 0.2), widths[i], h * (1 - i * 0.25), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayerShape(p, bodyColor, visorColor, isFlipped, hasCoyote) {
  if (!p.alive && gs.deathDelay <= 0) return;
  ctx.save();
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  let scaleY = 1;
  if (p.squishTimer > 0) { const t = p.squishTimer / PLAYER_CFG.SQUISH_FRAMES; scaleY = 0.6 + 0.4 * (1 - t); }
  ctx.translate(cx, cy); ctx.scale(1, scaleY); ctx.translate(-cx, -cy);

  if (hasCoyote && gs.coyoteTimer > 0) { ctx.shadowBlur = 16; ctx.shadowColor = '#ff8800'; }
  else { ctx.shadowBlur = 8; ctx.shadowColor = bodyColor; }

  const bx = p.x, by = p.y, bw = p.width, bh = p.height, r = 5;
  ctx.fillStyle = bodyColor;
  roundRect(ctx, bx, by, bw, bh, r); ctx.fill();

  ctx.shadowBlur = 4; ctx.shadowColor = visorColor; ctx.fillStyle = visorColor;
  const vw = bw * 0.55, vh = bh * 0.3, vx = bx + bw * 0.3, vy = by + bh * 0.25, vr = 3;
  roundRect(ctx, vx, vy, vw, vh, vr); ctx.fill();

  ctx.shadowBlur = 0; ctx.fillStyle = COLORS.NEON_CYAN;
  const antY = isFlipped ? by + bh + 3 : by - 3;
  ctx.beginPath(); ctx.arc(bx + bw * 0.35, antY, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + bw * 0.65, antY, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  drawPlayerShape(gs.player, COLORS.PLAYER, COLORS.VISOR, gs.gravityFlipped, true);
}

function drawPlayer2() {
  if (gs.mode !== 'mirror' || !gs.player2) return;
  drawPlayerShape(gs.player2, COLORS.NEON_PINK, '#ffaadd', !gs.gravityFlipped, false);
}

function drawParticles() {
  for (let i = 0; i < gs.particles.length; i++) {
    const pt = gs.particles[i];
    ctx.globalAlpha = pt.life / pt.maxLife;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStarbursts() {
  ctx.save();
  for (let i = 0; i < gs.starbursts.length; i++) {
    const sb = gs.starbursts[i];
    const alpha = 1 - sb.timer / sb.duration;
    ctx.strokeStyle = 'rgba(255,221,0,' + alpha + ')';
    ctx.lineWidth = 1.5;
    for (let j = 0; j < 8; j++) {
      const angle = (j / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sb.x + Math.cos(angle) * sb.radius * 0.3, sb.y + Math.sin(angle) * sb.radius * 0.3);
      ctx.lineTo(sb.x + Math.cos(angle) * sb.radius, sb.y + Math.sin(angle) * sb.radius);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGhostStars() {
  ctx.save();
  for (let i = 0; i < gs.ghostStars.length; i++) {
    const g = gs.ghostStars[i];
    const alpha = 0.5 * (1 - g.timer / g.duration);
    ctx.fillStyle = 'rgba(255,221,0,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.radius * (1 + g.timer / g.duration * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRipples() {
  ctx.save();
  for (let i = 0; i < gs.ripples.length; i++) {
    const r = gs.ripples[i];
    const alpha = 0.5 * (1 - r.timer / r.duration);
    ctx.strokeStyle = 'rgba(68,68,255,' + alpha + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - r.width / 2, r.y); ctx.lineTo(r.x + r.width / 2, r.y); ctx.stroke();
  }
  ctx.restore();
}

function drawPopups() {
  ctx.save();
  for (let i = 0; i < gs.popups.length; i++) {
    const pp = gs.popups[i];
    const alpha = pp.life / pp.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pp.color;
    ctx.font = 'bold ' + pp.size + 'px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8; ctx.shadowColor = pp.color;
    ctx.fillText(pp.text, pp.x, pp.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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

function drawZoneWipe() {
  if (!gs.zoneWipe.active) return;
  ctx.save();
  const w = gs.zoneWipe;
  const progress = w.timer / w.duration;
  const bandW = 60;
  const x = progress * (DISPLAY.WIDTH + bandW * 2) - bandW;
  const alpha = 0.35 * (1 - progress * 0.5);

  const grd = ctx.createLinearGradient(x - bandW, 0, x + bandW, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.5, w.color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  if (progress > 0.25 && progress < 0.75) {
    const tAlpha = Math.sin((progress - 0.25) / 0.5 * Math.PI);
    ctx.globalAlpha = tAlpha;
    ctx.fillStyle = COLORS.NEON_PINK;
    ctx.font = 'bold 32px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 15; ctx.shadowColor = COLORS.NEON_PINK;
    ctx.fillText(w.label, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

function drawMaxSpeedFlash() {
  if (gs.mode !== 'blitz' || gs.speed < 14) return;
  const cycle = gs.frameCount % 120;
  if (cycle < 8) {
    const alpha = 0.15 * (1 - cycle / 8);
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.fillRect(0, 0, 30, DISPLAY.HEIGHT);
    ctx.fillRect(DISPLAY.WIDTH - 30, 0, 30, DISPLAY.HEIGHT);
  }
}

function drawHUD() {
  ctx.save();
  ctx.shadowBlur = 0; ctx.textBaseline = 'top';

  ctx.font = '11px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 16, 12);
  ctx.font = 'bold 22px Orbitron, monospace';
  ctx.fillStyle = COLORS.TEXT;
  ctx.fillText(gs.score.toString(), 16, 26);

  ctx.font = '10px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('DIST ' + Math.floor(gs.distanceTraveled), 16, 52);

  ctx.textAlign = 'right';
  ctx.font = '11px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('BEST', DISPLAY.WIDTH - 16, 12);
  ctx.font = 'bold 18px Orbitron, monospace';
  ctx.fillStyle = COLORS.TEXT;
  ctx.fillText(gs.highScore.toString(), DISPLAY.WIDTH - 16, 26);

  // Zone
  ctx.textAlign = 'center';
  ctx.font = '10px Orbitron, monospace';
  let zc = 'rgba(255,255,255,0.4)';
  if (gs.currentZone >= 4) zc = 'rgba(255,60,60,0.6)';
  else if (gs.currentZone === 3) zc = 'rgba(180,80,255,0.6)';
  else if (gs.currentZone === 2) zc = 'rgba(80,120,255,0.6)';
  ctx.fillStyle = zc;
  ctx.fillText('ZONE ' + gs.currentZone, DISPLAY.WIDTH / 2, 26);

  // Gravity arrow
  if (gs.player.alive) {
    const p = gs.player;
    const arrowX = p.x + p.width + 14;
    const arrowY = p.y + p.height / 2;
    const pulse = 0.6 + 0.4 * Math.sin(gs.frameCount * 0.1);
    ctx.fillStyle = 'rgba(0,255,255,' + pulse + ')';
    ctx.font = '16px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(gs.gravityFlipped ? '\u2191' : '\u2193', arrowX, arrowY);
  }

  // Mirror mode labels
  if (gs.mode === 'mirror') {
    ctx.font = '10px Orbitron, monospace'; ctx.textAlign = 'center';
    if (gs.player.alive) {
      const bob1 = 3 * Math.sin(gs.frameCount * 0.08);
      ctx.fillStyle = COLORS.NEON_CYAN;
      ctx.fillText('P1', gs.player.x + gs.player.width / 2, gs.player.y - 14 + bob1);
    }
    if (gs.player2 && gs.player2.alive) {
      const bob2 = 3 * Math.sin(gs.frameCount * 0.08 + Math.PI);
      ctx.fillStyle = COLORS.NEON_PINK;
      ctx.fillText('P2', gs.player2.x + gs.player2.width / 2, gs.player2.y - 14 + bob2);
    }
  }

  ctx.restore();
}

function drawModeBadge() {
  if (gs.screen !== 'playing' && gs.screen !== 'paused') return;
  ctx.save();
  const mColors = { classic: COLORS.NEON_CYAN, mirror: COLORS.NEON_PINK, blitz: COLORS.NEON_ORANGE };
  const mNames = { classic: 'CLASSIC', mirror: 'MIRROR', blitz: 'BLITZ' };
  const color = mColors[gs.mode]; const name = mNames[gs.mode];
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '9px Orbitron, monospace'; ctx.fillStyle = color;
  const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.08);
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(DISPLAY.WIDTH / 2 - 30, 15, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillText('\u25CF ' + name, DISPLAY.WIDTH / 2, 10);
  ctx.restore();
}

function drawSpeedMeter() {
  if (gs.mode !== 'blitz') return;
  ctx.save();
  const x = 10, y = DISPLAY.HEIGHT / 2 - 60, w = 12, h = 120;
  const initialSpd = 5, maxSpd = 14;
  const fill = Math.min(1, Math.max(0, (gs.speed - initialSpd) / (maxSpd - initialSpd)));
  let ox = 0, oy = 0;
  if (gs.speed >= maxSpd - 0.5) { ox = (Math.random() - 0.5) * 3; oy = (Math.random() - 0.5) * 3; }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + ox, y + oy, w, h);
  const fillH = h * fill;
  const grd = ctx.createLinearGradient(0, y + h, 0, y);
  grd.addColorStop(0, '#00ff00'); grd.addColorStop(0.4, '#ffff00');
  grd.addColorStop(0.7, '#ff8800'); grd.addColorStop(1, '#ff0000');
  ctx.fillStyle = grd;
  ctx.fillRect(x + ox, y + h - fillH + oy, w, fillH);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + ox, y + oy, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '8px Orbitron, monospace'; ctx.textAlign = 'center';
  ctx.fillText('SPD', x + w / 2 + ox, y - 8 + oy);
  ctx.restore();
}

function drawDeathFlashEffect() {
  const df = gs.deathFlash;
  if (!df.active) return;
  const alpha = 0.6 * (1 - df.timer / df.duration);
  ctx.fillStyle = 'rgba(255,50,50,' + alpha + ')';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
}

// ═══════════════════════════════════════════════════════════════
//  SCREEN OVERLAYS
// ═══════════════════════════════════════════════════════════════
function drawStartScreen() {
  if (gs.screen !== 'start') return;
  ctx.fillStyle = 'rgba(10,10,26,0.85)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  // Demo astronaut
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  ctx.save();
  ctx.shadowBlur = 8; ctx.shadowColor = '#fff'; ctx.fillStyle = COLORS.PLAYER;
  const dx = DISPLAY.WIDTH * 0.2, dy = gs.demoY, dw = PLAYER_CFG.SIZE, dh = PLAYER_CFG.SIZE;
  roundRect(ctx, dx, dy, dw, dh, 4); ctx.fill();
  ctx.shadowBlur = 3; ctx.shadowColor = COLORS.VISOR; ctx.fillStyle = COLORS.VISOR;
  ctx.fillRect(dx + dw * 0.3, dy + dh * 0.25, dw * 0.5, dh * 0.3);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 20; ctx.shadowColor = COLORS.NEON_CYAN;
  ctx.fillStyle = COLORS.NEON_CYAN;
  ctx.font = 'bold 52px Orbitron, monospace';
  ctx.fillText('GRAVFLIP', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.32);
  ctx.shadowColor = COLORS.NEON_PINK; ctx.fillStyle = COLORS.NEON_PINK;
  ctx.font = 'bold 38px Orbitron, monospace';
  ctx.fillText('RUNNER', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.46);

  const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.06);
  ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(255,255,255,' + pulse + ')';
  ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.5) + ')';
  ctx.font = '16px Orbitron, monospace';
  ctx.fillText('PRESS SPACE OR TAP', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.64);

  const best = loadBestOverall();
  if (best > 0) {
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px Orbitron, monospace';
    ctx.fillText('BEST: ' + best, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.76);
  }
  ctx.restore();
}

// --- Mode Select Card Icons ---
function drawClassicIcon(cx, cy, color) {
  ctx.save(); ctx.fillStyle = color;
  roundRect(ctx, cx - 10, cy - 10, 20, 20, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(cx - 2, cy - 6, 11, 7);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx - 2, cy - 14, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 14, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMirrorIcon(cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  // Up arrow
  ctx.beginPath(); ctx.moveTo(cx - 8, cy + 6); ctx.lineTo(cx - 8, cy - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 14, cy - 5); ctx.lineTo(cx - 8, cy - 12); ctx.lineTo(cx - 2, cy - 5); ctx.stroke();
  // Down arrow
  ctx.beginPath(); ctx.moveTo(cx + 8, cy - 6); ctx.lineTo(cx + 8, cy + 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 2, cy + 5); ctx.lineTo(cx + 8, cy + 12); ctx.lineTo(cx + 14, cy + 5); ctx.stroke();
  ctx.restore();
}

function drawBlitzIcon(cx, cy, color) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy - 16); ctx.lineTo(cx - 8, cy - 1);
  ctx.lineTo(cx - 1, cy - 1); ctx.lineTo(cx - 3, cy + 16);
  ctx.lineTo(cx + 8, cy + 1); ctx.lineTo(cx + 1, cy + 1);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawModeSelectScreen() {
  if (gs.screen !== 'modeselect') return;
  ctx.fillStyle = 'rgba(10,10,26,0.82)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);

  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 10; ctx.shadowColor = COLORS.NEON_CYAN;
  ctx.fillStyle = COLORS.TEXT;
  ctx.font = 'bold 26px Orbitron, monospace';
  ctx.fillText('SELECT MODE', DISPLAY.WIDTH / 2, 55);
  ctx.shadowBlur = 0;

  const cardW = 170, cardH = 200, gap = 30;
  const totalW = cardW * 3 + gap * 2;
  const startX = (DISPLAY.WIDTH - totalW) / 2;
  const cardY = 85;

  const modes = [
    { name: 'CLASSIC', desc: ['The original.', 'Survive as long as you can.'], color: COLORS.NEON_CYAN, icon: drawClassicIcon },
    { name: 'MIRROR', desc: ['Two players. One screen.', 'Both must survive.'], color: COLORS.NEON_PINK, icon: drawMirrorIcon },
    { name: 'BLITZ', desc: ['Speed keeps rising.', 'Never slows down.'], color: COLORS.NEON_ORANGE, icon: drawBlitzIcon }
  ];

  modes.forEach((m, i) => {
    const x = startX + i * (cardW + gap);
    const sel = i === gs.modeSelectIndex;

    ctx.fillStyle = sel ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, x, cardY, cardW, cardH, 10); ctx.fill();

    if (sel) {
      ctx.shadowBlur = 20; ctx.shadowColor = m.color;
      ctx.strokeStyle = m.color; ctx.lineWidth = 2;
      roundRect(ctx, x, cardY, cardW, cardH, 10); ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      roundRect(ctx, x, cardY, cardW, cardH, 10); ctx.stroke();
    }

    m.icon(x + cardW / 2, cardY + 50, m.color);

    ctx.fillStyle = sel ? m.color : 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 18px Orbitron, monospace';
    ctx.fillText(m.name, x + cardW / 2, cardY + 105);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Orbitron, monospace';
    m.desc.forEach((line, li) => {
      ctx.fillText(line, x + cardW / 2, cardY + 135 + li * 16);
    });

    // Best score for this mode
    const modeBest = loadHighScore(['classic', 'mirror', 'blitz'][i]);
    if (modeBest > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px Orbitron, monospace';
      ctx.fillText('BEST: ' + modeBest, x + cardW / 2, cardY + cardH - 15);
    }
  });

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + pulse * 0.3) + ')';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('\u2190 \u2192 TO SELECT    SPACE TO CONFIRM', DISPLAY.WIDTH / 2, cardY + cardH + 35);

  ctx.restore();
}

function drawPauseScreen() {
  if (gs.screen !== 'paused') return;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 20; ctx.shadowColor = COLORS.NEON_CYAN;
  ctx.fillStyle = COLORS.NEON_CYAN;
  ctx.font = 'bold 44px Orbitron, monospace';
  ctx.fillText('PAUSED', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.4);

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.05);
  ctx.shadowBlur = 4;
  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  ctx.fillText('PRESS P OR ESC TO RESUME', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.55);
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('SCORE: ' + gs.score + '    BEST: ' + gs.highScore, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.68);
  ctx.restore();
}

function drawDeathScreen() {
  if (gs.screen !== 'dead') return;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  ctx.shadowBlur = 20; ctx.shadowColor = COLORS.OBSTACLE;
  ctx.fillStyle = COLORS.OBSTACLE;
  ctx.font = 'bold 48px Orbitron, monospace';
  ctx.fillText('GAME OVER', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.25);

  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('SCORE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.35);
  ctx.fillStyle = COLORS.TEXT;
  ctx.font = 'bold 28px Orbitron, monospace';
  ctx.fillText(gs.score.toString(), DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.42);

  // Mode stats
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px Orbitron, monospace';
  if (gs.mode === 'classic') {
    const secs = Math.floor(gs.modeStats.playTimeMs / 1000);
    ctx.fillText('Survived ' + secs + 's  \u2502  Stars: ' + gs.modeStats.starsCollected, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  } else if (gs.mode === 'mirror') {
    const who = gs.modeStats.whoDied === 'p2' ? 'P2 died' : 'P1 died';
    ctx.fillText(who + '  \u2502  Flips: ' + gs.modeStats.syncFlips, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  } else if (gs.mode === 'blitz') {
    ctx.fillText('Max speed: ' + gs.modeStats.maxSpeedReached.toFixed(1) + '  \u2502  Zones: ' + gs.modeStats.zonesCleared, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  }

  if (gs.newBest) {
    const sparkle = 0.7 + 0.3 * Math.sin(gs.frameCount * 0.12);
    ctx.shadowBlur = 12; ctx.shadowColor = COLORS.STAR;
    ctx.fillStyle = 'rgba(255,221,0,' + sparkle + ')';
    ctx.font = 'bold 20px Orbitron, monospace';
    ctx.fillText('\u2726 NEW BEST \u2726', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.62);
  }

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.shadowBlur = 4;
  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  ctx.fillText('PRESS SPACE OR TAP TO CONTINUE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.80);
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

  // ── UPDATE ──
  if (gs.screen === 'playing' && gs.player.alive) {
    updateSinglePlayer(gs.player, false, dt);
    if (gs.mode === 'mirror' && gs.player2 && gs.player2.alive) {
      updateSinglePlayer(gs.player2, true, dt);
    }
    updateObstacles(dt);
    updateStars(dt);
    updateParticles(dt);
    updateStarbursts(dt);
    updateGhostStars(dt);
    updateRipples(dt);
    updatePopups(dt);
    updateStarfield(dt);
    updateNebulas(dt);
    updateScreenShake(dt);
    updateDeathFlash(dt);
    updateZoneWipe(dt);
    updateFloorPulse(dt);
    updateEngineFlash(dt);

    gs.gridOffset += gs.speed * dt;
    gs.modeStats.playTimeMs += dt * 16.67;

    // Coyote timer
    if (gs.coyoteTimer > 0) {
      gs.coyoteTimer -= dt * 16.67;
      if (gs.coyoteTimer <= 0) {
        gs.coyoteTimer = 0;
        const p = gs.player;
        for (let i = 0; i < gs.obstacles.length; i++) {
          const o = gs.obstacles[i];
          if (aabbOverlap(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) { killPlayer('p1'); break; }
        }
      }
    }

    checkObstacleCollisions();
    checkStarCollisions();
    checkDangerWarning();

    gs.score += Math.floor(dt);
    gs.distanceTraveled += gs.speed * dt;
    checkZoneMilestone();

    const speedInc = gs.mode === 'blitz' ? SPEED.INCREMENT * 3 : SPEED.INCREMENT;
    const maxSpeed = gs.mode === 'blitz' ? 14 : SPEED.MAX;
    if (gs.speed < maxSpeed) gs.speed += speedInc * dt;

    if (gs.mode === 'blitz') {
      gs.modeStats.maxSpeedReached = Math.max(gs.modeStats.maxSpeedReached, gs.speed);
      if (gs.speed > 12 && !speedWarningOsc) startSpeedWarning();
      else if (gs.speed <= 12 && speedWarningOsc) stopSpeedWarning();
    }

    // Mirror mode: check if P2 died
    if (gs.mode === 'mirror' && gs.player2 && !gs.player2.alive && gs.player.alive) {
      // P2 died — handled in killPlayer
    }

    gs.frameCount++;

  } else if (gs.screen === 'playing' && !gs.player.alive) {
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
    const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
    const ceilY = DISPLAY.FLOOR_HEIGHT;
    gs.demoVy += gs.demoFlipped ? -0.35 : 0.35;
    gs.demoY += gs.demoVy;
    if (gs.demoY + PLAYER_CFG.SIZE >= floorY) { gs.demoY = floorY - PLAYER_CFG.SIZE; gs.demoVy = -8; gs.demoFlipped = !gs.demoFlipped; }
    if (gs.demoY <= ceilY) { gs.demoY = ceilY; gs.demoVy = 8; gs.demoFlipped = !gs.demoFlipped; }
    updateStarfield(dt);
    updateNebulas(dt);
    gs.frameCount++;
  } else if (gs.screen === 'modeselect') {
    updateStarfield(dt);
    updateNebulas(dt);
    gs.frameCount++;
  } else if (gs.screen === 'paused') {
    gs.frameCount++;
  } else if (gs.screen === 'dead') {
    updateParticles(dt);
    gs.frameCount++;
  }

  // ── DRAW ──
  ctx.save();
  if (gs.screenShake.active) {
    const si = gs.screenShake.intensity;
    ctx.translate((Math.random() - 0.5) * si * 2, (Math.random() - 0.5) * si * 2);
  }

  drawBackground();
  drawNebulas();
  drawStarfieldBg();
  drawSpeedLines();
  drawFloorAndCeiling();
  drawFloorGrid();
  drawObstacleTrails();
  drawObstacles();
  drawStars();
  drawGhostStars();

  // Trails
  drawTrailFor(gs.player, 'rgba(68,136,255,1)');
  if (gs.mode === 'mirror' && gs.player2) drawTrailFor(gs.player2, 'rgba(255,68,170,1)');

  // Engine glow
  drawEngineGlow(gs.player, false);
  if (gs.mode === 'mirror' && gs.player2) drawEngineGlow(gs.player2, true);

  drawPlayer();
  drawPlayer2();
  drawParticles();
  drawStarbursts();
  drawPopups();
  drawRipples();
  drawDangerVignette();
  drawVignette();
  drawHUD();
  drawModeBadge();
  drawSpeedMeter();
  drawZoneWipe();
  drawMaxSpeedFlash();
  drawDeathFlashEffect();

  ctx.restore();

  // Overlay screens (no shake)
  drawStartScreen();
  drawModeSelectScreen();
  drawPauseScreen();
  drawDeathScreen();

  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
requestAnimationFrame(gameLoop);
