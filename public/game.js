// @license PROPRIETARY — All rights reserved. Do not copy or reuse.

// ═══════════════════════════════════════════════════════════════
//  API LAYER — Session, Leaderboard, Score Submission
// ═══════════════════════════════════════════════════════════════
const API = {
  sessionId: null,
  _ready: false,

  async init() {
    // Try localStorage first (persist session across refreshes)
    try {
      this.sessionId = localStorage.getItem('gravflip_session');
    } catch (e) {}
    if (this.sessionId) { this._ready = true; return; }
    try {
      const res = await fetch('/api/auth', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.sessionId = data.sessionId;
        try { localStorage.setItem('gravflip_session', this.sessionId); } catch (e) {}
      }
    } catch (e) {
      // Offline fallback — game still works, scores just won't submit
      this.sessionId = 'offline_' + Math.random().toString(36).substring(2);
    }
    this._ready = true;
  },

  async getLeaderboard() {
    try {
      const res = await fetch('/api/scores');
      if (!res.ok) return [];
      const data = await res.json();
      return data.scores || [];
    } catch (e) { return []; }
  },

  async submitScore(score, playerName, gameData) {
    if (!this.sessionId || this.sessionId.startsWith('offline_')) return false;
    try {
      const token = await this._signScore(score, this.sessionId, gameData);
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId
        },
        body: JSON.stringify({ score, playerName, token, gameData })
      });
      return res.ok;
    } catch (e) { return false; }
  },

  async _signScore(score, sessionId, gameData) {
    const secret = 'grvflp_' + (navigator.userAgent || '').length;
    const payload = JSON.stringify({ score, sessionId, gameData }) + secret;
    const msgBuffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

// ═══════════════════════════════════════════════════════════════
//  OVERLAY DOM WIRING
// ═══════════════════════════════════════════════════════════════
const overlayLeaderboard = document.getElementById('leaderboard-overlay');
const overlayName = document.getElementById('name-overlay');
const leaderboardList = document.getElementById('leaderboard-list');
const closeLeaderboardBtn = document.getElementById('close-leaderboard');
const submitScoreBtn = document.getElementById('submit-score-btn');
const skipScoreBtn = document.getElementById('skip-score-btn');
const playerNameInput = document.getElementById('player-name-input');
const nameOverlayScore = document.getElementById('name-overlay-score');
const loadingIndicator = document.getElementById('loading-indicator');

function showLoading() { if (loadingIndicator) loadingIndicator.classList.remove('hidden'); }
function hideLoading() { if (loadingIndicator) loadingIndicator.classList.add('hidden'); }

function showLeaderboard() {
  if (!overlayLeaderboard || !leaderboardList) return;
  overlayLeaderboard.classList.remove('hidden');
  showLoading();
  API.getLeaderboard().then(scores => {
    hideLoading();
    if (scores.length === 0) {
      leaderboardList.innerHTML = '<div class="lb-empty">NO SCORES YET — BE THE FIRST!</div>';
      return;
    }
    leaderboardList.innerHTML = scores.map((s, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      return `<div class="lb-entry">
        <span class="lb-rank ${rankClass}">${i + 1}</span>
        <span class="lb-name">${escapeHtml(s.name || 'Anonymous')}</span>
        <span class="lb-score">${s.score}</span>
      </div>`;
    }).join('');
  }).catch(() => {
    hideLoading();
    leaderboardList.innerHTML = '<div class="lb-empty">OFFLINE — CANNOT LOAD SCORES</div>';
  });
}

function hideLeaderboard() {
  if (overlayLeaderboard) overlayLeaderboard.classList.add('hidden');
}

function showNameEntry(score) {
  if (!overlayName) return;
  if (nameOverlayScore) nameOverlayScore.textContent = 'SCORE: ' + Math.floor(score);
  if (playerNameInput) {
    playerNameInput.value = '';
    try {
      const saved = localStorage.getItem('gravflip_playerName');
      if (saved) playerNameInput.value = saved;
    } catch (e) {}
  }
  overlayName.classList.remove('hidden');
  if (playerNameInput) setTimeout(() => playerNameInput.focus(), 100);
}

function hideNameEntry() {
  if (overlayName) overlayName.classList.add('hidden');
}

async function doScoreSubmit() {
  const name = (playerNameInput ? playerNameInput.value : 'Anonymous')
    .replace(/[^a-zA-Z0-9 _\-]/g, '').substring(0, 16) || 'Anonymous';
  try { localStorage.setItem('gravflip_playerName', name); } catch (e) {}
  hideNameEntry();
  showLoading();
  const gameData = gs._lastGameData || {
    frameCount: gs.frameCount,
    starsCollected: gs.modeStats.starsCollected,
    survivalTimeMs: gs.modeStats.playTimeMs,
    finalSpeed: gs.speed,
    mode: gs.mode,
    world: gs.campaign ? gs.campaign.currentWorld : 0
  };
  await API.submitScore(gs.score, name, gameData);
  hideLoading();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Wire overlay buttons
if (closeLeaderboardBtn) closeLeaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation(); hideLeaderboard();
});
if (submitScoreBtn) submitScoreBtn.addEventListener('click', (e) => {
  e.stopPropagation(); doScoreSubmit();
});
if (skipScoreBtn) skipScoreBtn.addEventListener('click', (e) => {
  e.stopPropagation(); hideNameEntry();
});
if (playerNameInput) playerNameInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.code === 'Enter') { e.preventDefault(); doScoreSubmit(); }
});
// Prevent overlay clicks from reaching game canvas
if (overlayLeaderboard) overlayLeaderboard.addEventListener('click', (e) => e.stopPropagation());
if (overlayLeaderboard) overlayLeaderboard.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
if (overlayName) overlayName.addEventListener('click', (e) => e.stopPropagation());
if (overlayName) overlayName.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });

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

function loadCampaignProgress() {
  try {
    const data = localStorage.getItem('gravflip_campaign');
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.world === 'number' && Array.isArray(parsed.starsPerWorld)) {
        return parsed;
      }
    }
  } catch (e) {}
  return { world: 1, starsPerWorld: [0, 0, 0, 0, 0] };
}

function saveCampaignProgress(p) {
  try {
    localStorage.setItem('gravflip_campaign', JSON.stringify(p));
  } catch (e) {}
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
    killedBy: null,
    campaign: null,
    theme: 'deepspace',
    themeTransition: { active: false, progress: 0, fromTheme: 'deepspace', toTheme: 'deepspace' },
    themeBadgeTimer: 0,
    themeBadgeName: '',
    lastLaserDist: 0,
    laserInterval: 800 + Math.random() * 400,
    lastCrusherDist: 0,
    crusherInterval: 600 + Math.random() * 400,
    lastPhantomDist: 0,
    phantomInterval: 500 + Math.random() * 300,
    lastSawDist: 0,
    sawInterval: 400 + Math.random() * 300,
    lastObstacleType: 'basic',
    worldCompleteSelectIndex: 0,
    modeStats: {
      playTimeMs: 0, starsCollected: 0,
      whoDied: null, syncFlips: 0,
      maxSpeedReached: 0, zonesCleared: 0
    },
    // Anti-cheat game data (recorded on death, sent to server)
    gameStartTime: 0,
    _lastGameData: null
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

function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
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
  
  let type = 'basic';
  const distAtSpawn = gs.distanceTraveled + (gs.nextObstacleX - gs.player.x);
  
  const isCampaignEligible = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld >= 2;
  const isOtherModeEligible = gs.mode !== 'campaign' && (gs.currentZone >= 2 || gs.mode === 'blitz');
  
  if ((isCampaignEligible || isOtherModeEligible) && gs.lastObstacleType === 'basic') {
    const candidates = [];
    if (distAtSpawn - gs.lastLaserDist >= gs.laserInterval) candidates.push('laser');
    if (distAtSpawn - gs.lastCrusherDist >= gs.crusherInterval) candidates.push('crusher');
    if (distAtSpawn - gs.lastPhantomDist >= gs.phantomInterval) candidates.push('phantom');
    if (distAtSpawn - gs.lastSawDist >= gs.sawInterval) candidates.push('saw');
    
    if (candidates.length > 0) {
      type = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  
  if (type === 'basic') {
    const fromFloor = Math.random() > 0.5;
    const w = GAMEPLAY.OBSTACLE_MIN_W + Math.random() * (GAMEPLAY.OBSTACLE_MAX_W - GAMEPLAY.OBSTACLE_MIN_W);
    const gapMult = gs.mode === 'blitz' ? 0.8 : 1;
    const minGap = GAMEPLAY.MIN_GAP * gapMult;
    const maxH = playH - minGap;
    const h = 40 + Math.random() * Math.max(1, maxH - 40);
    const x = gs.nextObstacleX;
    const y = fromFloor ? floorY - h : ceilY;
    
    const isCampaignW3 = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 3;
    if (isCampaignW3) {
      const size = 35 + Math.random() * 10;
      const asteroidY = fromFloor ? floorY - size : ceilY;
      gs.obstacles.push({
        type: 'basic',
        isAsteroid: true,
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.01 + Math.random() * 0.02),
        x, y: asteroidY, width: size, height: size, fromFloor,
        glowPhase: Math.random() * Math.PI * 2
      });
    } else {
      gs.obstacles.push({
        type: 'basic', x, y, width: w, height: h, fromFloor,
        glowPhase: Math.random() * Math.PI * 2
      });
    }
    
    gs.lastObstacleType = 'basic';
    
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
      
      let starShape = 'star';
      if (gs.mode === 'campaign' && gs.campaign) {
        if (gs.campaign.currentWorld === 2) starShape = 'coin';
        else if (gs.campaign.currentWorld === 3) starShape = 'crystal';
        else if (gs.campaign.currentWorld === 4) starShape = 'orb';
        else if (gs.campaign.currentWorld === 5) starShape = 'rainbow';
      }
      gs.stars.push({
        x: x + w / 2 + (Math.random() - 0.5) * 60, y: sY,
        radius: GAMEPLAY.STAR_RADIUS, phase: Math.random() * Math.PI * 2,
        shape: starShape
      });
    }
  } else if (type === 'laser') {
    const x = gs.nextObstacleX;
    gs.obstacles.push({
      type: 'laser',
      x, y: ceilY, width: 30, height: playH,
      state: 'off', stateTimer: 0,
      glowPhase: 0
    });
    gs.lastLaserDist = distAtSpawn;
    gs.laserInterval = 800 + Math.random() * 400;
    gs.lastObstacleType = 'laser';
    gs.nextObstacleX = x + 300 + Math.random() * 150;
  } else if (type === 'crusher') {
    const x = gs.nextObstacleX;
    gs.obstacles.push({
      type: 'crusher',
      x, y: floorY - 40, width: 60, height: 40,
      moveDirection: -1, moveTimer: 0,
      glowPhase: 0
    });
    gs.lastCrusherDist = distAtSpawn;
    gs.crusherInterval = 600 + Math.random() * 400;
    gs.lastObstacleType = 'crusher';
    gs.nextObstacleX = x + 250 + Math.random() * 150;
  } else if (type === 'phantom') {
    const x = gs.nextObstacleX;
    const fromFloor = Math.random() > 0.5;
    const w = 40;
    const h = 60;
    const y = fromFloor ? floorY - h : ceilY;
    gs.obstacles.push({
      type: 'phantom',
      x, y, width: w, height: h,
      isSolid: Math.random() > 0.5,
      revealed: false,
      glowPhase: 0
    });
    gs.lastPhantomDist = distAtSpawn;
    gs.phantomInterval = 500 + Math.random() * 300;
    gs.lastObstacleType = 'phantom';
    gs.nextObstacleX = x + 220 + Math.random() * 100;
  } else if (type === 'saw') {
    const x = gs.nextObstacleX;
    const r = 18;
    const centerY = ceilY + 50 + Math.random() * (playH - 100);
    gs.obstacles.push({
      type: 'saw',
      x: x + r, y: centerY, centerY, radius: r, width: r * 2, height: r * 2,
      rotation: Math.random() * Math.PI,
      bobPhase: Math.random() * Math.PI * 2,
      glowPhase: 0
    });
    gs.lastSawDist = distAtSpawn;
    gs.sawInterval = 400 + Math.random() * 300;
    gs.lastObstacleType = 'saw';
    gs.nextObstacleX = x + 200 + Math.random() * 100;
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
  if (gs.killedBy) return; // already killed
  gs.killedBy = who || 'p1';
  
  const tgt = (who === 'p2' && gs.player2) ? gs.player2 : gs.player;
  
  if (gs.mode === 'mirror') {
    if (gs.player) gs.player.alive = false;
    if (gs.player2) gs.player2.alive = false;
    gs.modeStats.whoDied = who || 'p1';
  } else {
    gs.player.alive = false;
  }

  emitDeathParticles(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2);
  gs.comboCount = 0;
  gs.screenShake = { active: true, intensity: 8, duration: 400, timer: 0 };
  gs.deathFlash = { active: true, timer: 0, duration: 15 };
  deathSound(); stopDrone(); stopSpeedWarning();
  gs.deathDelay = 48;
  gs.newBest = false;
  
  // Record anti-cheat game data snapshot
  gs._lastGameData = {
    frameCount: gs.frameCount,
    starsCollected: gs.modeStats.starsCollected,
    survivalTimeMs: gs.modeStats.playTimeMs,
    finalSpeed: gs.speed,
    mode: gs.mode,
    world: gs.campaign ? gs.campaign.currentWorld : 0
  };
  
  if (gs.mode !== 'campaign') {
    if (gs.score > gs.highScore) {
      gs.highScore = gs.score;
      saveHighScore(gs.mode, gs.highScore);
      gs.newBest = true;
      gs.namePromptShown = false;
      gs.newBestTimer = 0;
    }
  }
}

function startCampaignWorld(worldNum) {
  stopArpeggio();
  const sf = gs.starfield;
  const neb = gs.nebulas;
  const fc = gs.frameCount;
  const idx = gs.modeSelectIndex;

  gs = createInitialState();
  gs.mode = 'campaign';
  gs.modeSelectIndex = idx;
  gs.starfield = sf;
  gs.nebulas = neb;
  gs.frameCount = fc;

  const wConfigs = [
    { name: 'THE VOID', goal: 800, speed: 2.5, msg: 'You escaped The Void!' },
    { name: 'NEON CITY', goal: 1200, speed: 3.5, msg: 'You outran the city!' },
    { name: 'ASTEROID BELT', goal: 1600, speed: 4.5, msg: 'You survived the belt!' },
    { name: 'SOLAR FLARE', goal: 2000, speed: 5.5, msg: 'You survived the flare!' },
    { name: 'THE SINGULARITY', goal: 2500, speed: 6.5, msg: 'You conquered the Singularity!' }
  ];
  const cfg = wConfigs[worldNum - 1];

  gs.campaign = {
    currentWorld: worldNum,
    distanceGoal: cfg.goal,
    deathCount: 0,
    bonusDistance: 0,
    name: cfg.name,
    message: cfg.msg,
    fireParticles: null,
    heatPulseTimer: 0,
    lastDroneDistance: 0
  };

  gs.speed = cfg.speed;
  gs.screen = 'playing';
  gs.player.alive = true;
  gs.modeStats.playTimeMs = 0;
  gs.gameStartTime = performance.now();
  gs._lastGameData = null;

  // Reset special spawn trackers
  gs.lastLaserDist = 0;
  gs.laserInterval = 800 + Math.random() * 400;
  gs.lastCrusherDist = 0;
  gs.crusherInterval = 600 + Math.random() * 400;
  gs.lastPhantomDist = 0;
  gs.phantomInterval = 500 + Math.random() * 300;
  gs.lastSawDist = 0;
  gs.sawInterval = 400 + Math.random() * 300;
  gs.lastObstacleType = 'basic';

  startDrone();
  document.body.classList.add('game-running');
  updateTapZoneVisibility();
}

function retryCampaignWorld() {
  const w = gs.campaign.currentWorld;
  const deaths = gs.campaign.deathCount + 1;
  startCampaignWorld(w);
  gs.campaign.deathCount = deaths;
}

function confirmModeSelection() {
  const modes = ['classic', 'mirror', 'blitz', 'campaign'];
  const sel = modes[gs.modeSelectIndex];
  
  if (sel === 'campaign') {
    const progress = loadCampaignProgress();
    startCampaignWorld(progress.world > 5 ? 1 : progress.world);
    return;
  }
  
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
  gs.gameStartTime = performance.now();
  gs._lastGameData = null;

  if (sel === 'blitz') gs.speed = 5;
  if (sel === 'mirror') gs.player2 = createPlayer(0.8, true);

  updateNebulaColors();
  startDrone();
  document.body.classList.add('game-running');
  updateTapZoneVisibility();
}

function getCanvasCoords(e) {
  const rect = cvs.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mx = ((clientX - rect.left) / rect.width) * DISPLAY.WIDTH;
  const my = ((clientY - rect.top) / rect.height) * DISPLAY.HEIGHT;
  return { mx, my };
}

function confirmWorldCompleteSelection() {
  const sel = gs.worldCompleteSelectIndex || 0;
  if (sel === 0) {
    if (gs.campaign.currentWorld < 5) {
      startCampaignWorld(gs.campaign.currentWorld + 1);
    } else {
      gs.screen = 'gamecomplete';
    }
  } else {
    startCampaignWorld(gs.campaign.currentWorld);
  }
}

function checkWorldCompleteClicks(mx, my) {
  const bY = DISPLAY.HEIGHT * 0.76;
  const btnW = 160;
  const btnH = 36;
  const b1X = DISPLAY.WIDTH / 2 - btnW - 20;
  const b2X = DISPLAY.WIDTH / 2 + 20;
  
  if (my >= bY && my <= bY + btnH) {
    if (mx >= b1X && mx <= b1X + btnW) {
      gs.worldCompleteSelectIndex = 0;
      confirmWorldCompleteSelection();
      return true;
    }
    if (mx >= b2X && mx <= b2X + btnW) {
      gs.worldCompleteSelectIndex = 1;
      confirmWorldCompleteSelection();
      return true;
    }
  }
  return false;
}

function handleInput(e) {
  if (e && (gs.screen === 'worldcomplete' || gs.screen === 'gamecomplete')) {
    const { mx, my } = getCanvasCoords(e);
    if (gs.screen === 'worldcomplete') {
      if (checkWorldCompleteClicks(mx, my)) return;
    }
  }

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
      if (gs.mode === 'campaign' && gs.campaign && isPlayerInInversionZone(gs.player)) {
        return;
      }
      flipGravity();
      break;
    case 'paused':
      resumeGame();
      break;
    case 'dead':
      if (gs.mode === 'campaign') {
        retryCampaignWorld();
      } else {
        gs.screen = 'modeselect';
        document.body.classList.remove('game-running');
        initAudio();
        startArpeggio();
      }
      break;
    case 'worldcomplete':
      confirmWorldCompleteSelection();
      break;
    case 'gamecomplete':
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
    if (e.code === 'ArrowRight') { e.preventDefault(); if (gs.modeSelectIndex < 3) gs.modeSelectIndex++; return; }
  }
  if (gs.screen === 'worldcomplete') {
    if (e.code === 'ArrowLeft') { e.preventDefault(); gs.worldCompleteSelectIndex = 0; return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); gs.worldCompleteSelectIndex = 1; return; }
  }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleInput(); return; }
  // Leaderboard toggle on L key
  if (e.code === 'KeyL' && (gs.screen === 'dead' || gs.screen === 'modeselect' || gs.screen === 'start')) {
    e.preventDefault();
    if (overlayLeaderboard && !overlayLeaderboard.classList.contains('hidden')) {
      hideLeaderboard();
    } else {
      showLeaderboard();
    }
    return;
  }
  // Submit score on S key from death screen
  if (e.code === 'KeyS' && gs.screen === 'dead' && gs.mode !== 'campaign') {
    e.preventDefault();
    showNameEntry(gs.score);
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (gs.screen === 'playing') pauseGame();
    else if (gs.screen === 'paused') resumeGame();
    else if (gs.screen === 'dead' || gs.screen === 'worldcomplete' || gs.screen === 'gamecomplete') {
      gs.screen = 'modeselect';
      document.body.classList.remove('game-running');
      initAudio();
      startArpeggio();
    }
  }
});

cvs.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
  if (gs.screen !== 'modeselect') handleInput(e);
}, { passive: false });

cvs.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (gs.screen === 'modeselect') {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && gs.modeSelectIndex < 3) gs.modeSelectIndex++;
      else if (dx > 0 && gs.modeSelectIndex > 0) gs.modeSelectIndex--;
    } else {
      confirmModeSelection();
    }
  }
}, { passive: false });

cvs.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(e); });

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
    const obs = gs.obstacles[i];
    
    if (obs.type === 'firewave') {
      obs.x -= spd * 1.5;
    } else {
      obs.x -= spd;
    }
    
    obs.glowPhase += 0.05 * dt;
    
    if (obs.type === 'laser') {
      obs.stateTimer += dt * 16.67;
      if (obs.state === 'off' && obs.stateTimer >= 800) {
        obs.state = 'warn'; obs.stateTimer = 0;
      } else if (obs.state === 'warn' && obs.stateTimer >= 300) {
        obs.state = 'on'; obs.stateTimer = 0;
      } else if (obs.state === 'on' && obs.stateTimer >= 1200) {
        obs.state = 'off'; obs.stateTimer = 0;
      }
    } else if (obs.type === 'crusher') {
      obs.moveTimer += dt * 16.67;
      
      const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
      const ceilY = DISPLAY.FLOOR_HEIGHT;
      
      if (obs.moveTimer >= 2000) {
        obs.moveTimer = 0;
        obs.moveDirection = -obs.moveDirection;
        
        // Trigger impact effect on completion of travel
        if (obs.x < DISPLAY.WIDTH && obs.x + obs.width > 0) {
          triggerScreenShake(3.5, 200);
          
          // Spawn impact sparks
          const sparkY = obs.moveDirection === -1 ? floorY : ceilY;
          for (let pIdx = 0; pIdx < 12; pIdx++) {
            gs.particles.push({
              x: obs.x + Math.random() * obs.width,
              y: sparkY,
              vx: (Math.random() - 0.5) * 5,
              vy: obs.moveDirection === -1 ? -(1 + Math.random() * 3) : (1 + Math.random() * 3),
              life: 15 + Math.random() * 15,
              maxLife: 30,
              color: '#ffaa00',
              size: 1.2 + Math.random() * 1.8
            });
          }
          
          // Play impact sound if crusher is near the player
          if (obs.x > gs.player.x - 100 && obs.x < gs.player.x + 350) {
            landingThud();
          }
        }
      }
      
      const t = obs.moveTimer / 2000;
      const startY = obs.moveDirection === -1 ? floorY - 40 : ceilY;
      const endY = obs.moveDirection === -1 ? ceilY : floorY - 40;
      obs.y = startY + (endY - startY) * t;
      
      if (Math.random() < 0.15 * dt) {
        gs.particles.push({
          x: obs.x + Math.random() * obs.width,
          y: obs.y + (obs.moveDirection === -1 ? obs.height : 0),
          vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
          life: 15, maxLife: 15, color: '#ffaa00', size: 1.5
        });
      }
    } else if (obs.type === 'saw') {
      obs.rotation += 0.08 * dt;
      obs.bobPhase += 0.04 * dt;
      obs.y += Math.sin(obs.bobPhase) * 0.8 * dt;
      
      const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
      const ceilY = DISPLAY.FLOOR_HEIGHT;
      const minY = ceilY + obs.radius;
      const maxY = floorY - obs.radius;
      if (obs.y < minY) obs.y = minY;
      if (obs.y > maxY) obs.y = maxY;
      
      if (Math.random() < 0.1 * dt) {
        gs.particles.push({
          x: obs.x, y: obs.y,
          vx: -gs.speed * 0.5 + (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 15, maxLife: 15, color: '#888888', size: 1.5
        });
      }
    } else if (obs.type === 'basic' && obs.isAsteroid) {
      obs.rotation += obs.rotSpeed * dt;
    }
    
    const checkW = obs.type === 'saw' ? obs.radius * 2 : obs.width || 30;
    if (obs.x + checkW < -100) {
      gs.obstacles.splice(i, 1);
    }
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

function triggerScreenShake(intensity, duration) {
  gs.screenShake = { active: true, intensity, duration, timer: 0 };
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
    if (o.type === 'basic' || o.type === 'crusher' || o.type === 'drone' || o.type === 'firewave') {
      if (aabbOverlap(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) {
        const overlapX = Math.min(p.x + p.width, o.x + o.width) - Math.max(p.x, o.x);
        if (overlapX <= GAMEPLAY.COYOTE_EDGE_PX && gs.coyoteTimer <= 0) {
          gs.coyoteTimer = GAMEPLAY.COYOTE_TIME; return;
        }
        if (gs.coyoteTimer > 0 && overlapX <= GAMEPLAY.COYOTE_EDGE_PX) return;
        killPlayer(who); return;
      }
    } else if (o.type === 'laser') {
      if (o.state === 'on') {
        const laserX = o.x + o.width / 2;
        // Laser beam collision (vertical line of 2px thickness)
        if (p.x < laserX + 1.5 && p.x + p.width > laserX - 1.5) {
          killPlayer(who); return;
        }
      }
    } else if (o.type === 'phantom') {
      if (aabbOverlap(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) {
        if (o.isSolid) {
          killPlayer(who); return;
        } else {
          if (!o.revealed) {
            o.revealed = true;
            spawnPopup('SAFE!', o.x + o.width / 2, o.y - 15, '#00ff44', 20);
            collectSound();
            for (let pIdx = 0; pIdx < 8; pIdx++) {
              gs.particles.push({
                x: o.x + o.width/2, y: o.y + o.height/2,
                vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                life: 20, maxLife: 20, color: '#00ff44', size: 2
              });
            }
          }
        }
      }
    } else if (o.type === 'saw') {
      if (circleRectCollide(o.x, o.y, o.radius, p.x, p.y, p.width, p.height)) {
        killPlayer(who); return;
      }
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

function getThemeForZone(z) {
  if (z <= 2) return 'deepspace';
  if (z <= 4) return 'neongrid';
  if (z <= 6) return 'crimsonvoid';
  return 'aurora';
}

function checkThemeChange() {
  if (gs.mode === 'campaign') return;
  const expectedTheme = getThemeForZone(gs.currentZone);
  if (expectedTheme !== gs.theme) {
    gs.themeTransition = {
      active: true,
      progress: 0,
      fromTheme: gs.theme,
      toTheme: expectedTheme
    };
    gs.theme = expectedTheme;
    
    const names = {
      deepspace: 'DEEP SPACE',
      neongrid: 'NEON GRID',
      crimsonvoid: 'CRIMSON VOID',
      aurora: 'AURORA'
    };
    gs.themeBadgeName = names[expectedTheme];
    gs.themeBadgeTimer = 180;
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
    checkThemeChange();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function drawPerspectiveGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 34, 51, 0.25)';
  ctx.lineWidth = 1;
  const horizonY = DISPLAY.HEIGHT / 2;
  const vpX = DISPLAY.WIDTH * 0.7;
  const vpY = horizonY;
  for (let angle = 0; angle < Math.PI; angle += Math.PI / 8) {
    ctx.beginPath();
    ctx.moveTo(vpX, vpY);
    const length = 1000;
    ctx.lineTo(vpX + Math.cos(angle) * length, vpY + Math.sin(angle) * length);
    ctx.lineTo(vpX + Math.cos(angle + Math.PI) * length, vpY + Math.sin(angle + Math.PI) * length);
    ctx.stroke();
  }
  const spacing = 20;
  const offset = (gs.distanceTraveled * 0.3) % spacing;
  for (let y = horizonY; y < DISPLAY.HEIGHT; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    ctx.lineTo(DISPLAY.WIDTH, y + offset);
    ctx.stroke();
  }
  for (let y = horizonY; y > 0; y -= spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y - offset);
    ctx.lineTo(DISPLAY.WIDTH, y - offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrimsonCloudsAndLightning() {
  ctx.save();
  ctx.fillStyle = 'rgba(26, 0, 8, 0.2)';
  const cloudOffset = (gs.distanceTraveled * 0.08) % 800;
  ctx.beginPath();
  ctx.moveTo(100 - cloudOffset, 200);
  ctx.bezierCurveTo(200 - cloudOffset, 100, 400 - cloudOffset, 100, 500 - cloudOffset, 200);
  ctx.bezierCurveTo(400 - cloudOffset, 300, 200 - cloudOffset, 300, 100 - cloudOffset, 200);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(500 - cloudOffset, 250);
  ctx.bezierCurveTo(600 - cloudOffset, 150, 750 - cloudOffset, 150, 850 - cloudOffset, 250);
  ctx.bezierCurveTo(750 - cloudOffset, 350, 600 - cloudOffset, 350, 500 - cloudOffset, 250);
  ctx.fill();
  
  if (gs.frameCount % 180 < 2) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let lx = Math.random() * DISPLAY.WIDTH;
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + (Math.random() - 0.5) * 30, 100);
    ctx.lineTo(lx + (Math.random() - 0.5) * 60, 250);
    ctx.lineTo(lx + (Math.random() - 0.5) * 30, DISPLAY.HEIGHT);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAuroraEffect() {
  ctx.save();
  const waves = [
    { color: 'rgba(0, 255, 136, 0.06)', freq: 0.005, phase: gs.frameCount * 0.01, speed: 0.1 },
    { color: 'rgba(136, 0, 255, 0.05)', freq: 0.007, phase: gs.frameCount * 0.008, speed: 0.07 },
    { color: 'rgba(0, 68, 255, 0.05)', freq: 0.004, phase: gs.frameCount * 0.012, speed: 0.12 }
  ];
  waves.forEach(w => {
    const drift = (gs.distanceTraveled * w.speed) % DISPLAY.WIDTH;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x < DISPLAY.WIDTH; x += 20) {
      const y = 80 + Math.sin(x * w.freq + w.phase) * 30;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(DISPLAY.WIDTH, 0);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawBackground() {
  ctx.save();
  if (gs.mode === 'campaign' && gs.campaign) {
    const w = gs.campaign.currentWorld;
    if (w === 1) {
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
    } else if (w === 2) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
      
      const cityOffset = (gs.distanceTraveled * 0.2) % 300;
      const buildings = [
        { x: 20, w: 45, h: 180 }, { x: 85, w: 60, h: 240 }, { x: 165, w: 50, h: 150 },
        { x: 235, w: 70, h: 280 }, { x: 325, w: 55, h: 200 }, { x: 400, w: 65, h: 220 },
        { x: 485, w: 50, h: 170 }, { x: 555, w: 75, h: 260 }
      ];
      ctx.fillStyle = '#111111';
      buildings.forEach(b => {
        let bx = b.x - cityOffset;
        while (bx < -b.w) bx += 600;
        ctx.fillRect(bx, DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT - b.h, b.w, b.h);
        
        ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
        for (let wx = bx + 5; wx < bx + b.w - 5; wx += 12) {
          for (let wy = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT - b.h + 15; wy < DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT - 10; wy += 20) {
            if (((Math.floor(wx + wy) % 5) !== 0)) {
              ctx.fillRect(wx, wy, 3, 5);
            }
          }
        }
        ctx.fillStyle = '#111111';
      });
    } else if (w === 3) {
      ctx.fillStyle = '#0d0a14';
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
      
      ctx.fillStyle = 'rgba(80, 70, 60, 0.12)';
      const driftOffset = (gs.distanceTraveled * 0.05) % 800;
      const boulders = [
        { x: 100, y: 120, pts: [[0, 0], [40, -10], [60, 20], [30, 50], [-10, 30]] },
        { x: 350, y: 280, pts: [[0, 0], [50, 10], [40, 40], [0, 50], [-30, 20]] },
        { x: 600, y: 150, pts: [[0, 0], [60, -20], [80, 20], [40, 60], [-20, 30]] },
        { x: 850, y: 220, pts: [[0, 0], [30, -15], [50, 15], [20, 45], [-15, 25]] }
      ];
      boulders.forEach(b => {
        let bx = b.x - driftOffset;
        while (bx < -100) bx += 900;
        ctx.beginPath();
        ctx.moveTo(bx + b.pts[0][0], b.y + b.pts[0][1]);
        for (let ptIdx = 1; ptIdx < b.pts.length; ptIdx++) {
          ctx.lineTo(bx + b.pts[ptIdx][0], b.y + b.pts[ptIdx][1]);
        }
        ctx.closePath();
        ctx.fill();
      });
    } else if (w === 4) {
      ctx.fillStyle = '#1a0500';
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
      
      if (!gs.campaign.fireParticles) {
        gs.campaign.fireParticles = [];
        for (let i = 0; i < 20; i++) {
          gs.campaign.fireParticles.push({
            x: Math.random() * DISPLAY.WIDTH,
            y: Math.random() * DISPLAY.HEIGHT,
            size: 1 + Math.random() * 3,
            speed: 0.5 + Math.random() * 1.5
          });
        }
      }
      ctx.fillStyle = 'rgba(255, 120, 0, 0.25)';
      gs.campaign.fireParticles.forEach(fp => {
        fp.y -= fp.speed * 0.8;
        if (fp.y < 0) {
          fp.y = DISPLAY.HEIGHT;
          fp.x = Math.random() * DISPLAY.WIDTH;
        }
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, fp.size, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (w === 5) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
      
      if (gs.frameCount % 30 < 2) {
        ctx.fillStyle = '#ffffff';
        for (let pIdx = 0; pIdx < 5; pIdx++) {
          const px = Math.random() * DISPLAY.WIDTH;
          const py = Math.random() * DISPLAY.HEIGHT;
          ctx.fillRect(px, py, 2, 2);
        }
      }
    }
  } else {
    let targetBg = COLORS.BG;
    if (gs.theme === 'neongrid') targetBg = '#050510';
    else if (gs.theme === 'crimsonvoid') targetBg = '#100005';
    else if (gs.theme === 'aurora') targetBg = '#000a05';
    
    ctx.fillStyle = targetBg;
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
    
    if (gs.themeTransition && gs.themeTransition.active) {
      const fromBg = gs.themeTransition.fromTheme === 'neongrid' ? '#050510' :
                     gs.themeTransition.fromTheme === 'crimsonvoid' ? '#100005' :
                     gs.themeTransition.fromTheme === 'aurora' ? '#000a05' : COLORS.BG;
      const progress = gs.themeTransition.progress / 60;
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - progress));
      ctx.fillStyle = fromBg;
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
      ctx.globalAlpha = 1;
    }
    
    if (gs.theme === 'neongrid') {
      drawPerspectiveGrid();
    } else if (gs.theme === 'crimsonvoid') {
      drawCrimsonCloudsAndLightning();
    } else if (gs.theme === 'aurora') {
      drawAuroraEffect();
    }
  }
  ctx.restore();
}

function drawNebulas() {
  if (gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld >= 4) return; // No nebulas in world 4 & 5
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
  ctx.save();
  const theme = gs.theme;
  const w = gs.mode === 'campaign' && gs.campaign ? gs.campaign.currentWorld : 0;
  
  let maxStars = gs.starfield.length;
  if (theme === 'neongrid') maxStars = 40;
  else if (theme === 'aurora') maxStars = 150;
  
  for (let i = 0; i < Math.min(maxStars, gs.starfield.length); i++) {
    const s = gs.starfield[i];
    let color = 'rgba(255,255,255,' + s.brightness + ')';
    if (theme === 'neongrid') {
      color = 'rgba(0,255,255,' + s.brightness + ')';
    } else if (theme === 'crimsonvoid' || w === 4) {
      color = 'rgba(255,68,68,' + s.brightness + ')';
    } else if (theme === 'aurora') {
      const hue = (i * 17) % 360;
      color = 'hsla(' + hue + ', 100%, 75%, ' + s.brightness + ')';
    }
    
    let size = s.size;
    if (theme === 'neongrid') {
      size = s.size * 1.5;
    }
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  
  ctx.save();
  
  let floorColor = COLORS.FLOOR;
  let glowColor = COLORS.FLOOR_GLOW;
  let floorPulse = gs.floorPulseTimer > 0 ? gs.floorPulseTimer * 0.75 : 0;
  let ceilPulse = gs.ceilingPulseTimer > 0 ? gs.ceilingPulseTimer * 0.75 : 0;
  
  if (gs.mode === 'campaign' && gs.campaign) {
    const w = gs.campaign.currentWorld;
    if (w === 2) {
      floorColor = '#1e1e1e';
      glowColor = '#00ffff';
    } else if (w === 3) {
      floorColor = '#4e3e2e';
      glowColor = '#ffaa00';
    } else if (w === 4) {
      floorColor = '#4a0f00';
      glowColor = '#ff5500';
    } else if (w === 5) {
      floorColor = '#110022';
      glowColor = '#8800ff';
    }
  } else {
    if (gs.theme === 'neongrid') {
      floorColor = '#100018';
      glowColor = '#ff0088';
    } else if (gs.theme === 'crimsonvoid') {
      floorColor = '#2a0005';
      glowColor = '#ff0022';
    } else if (gs.theme === 'aurora') {
      floorColor = '#001a0a';
      glowColor = '#00ff88';
    }
  }
  
  const floorGlowVal = 15 + floorPulse;
  const ceilGlowVal = 15 + ceilPulse;
  
  const isW3 = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 3;
  const isW4 = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 4;
  const isW5 = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 5;
  const isW2 = gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 2;
  
  let floorGlitchY = floorY;
  let ceilGlitchY = ceilY;
  if (isW5 && (gs.frameCount % 60 < 3)) {
    floorGlitchY += 8;
    ceilGlitchY -= 8;
  }
  
  // Ceiling Block and Glow Edge
  ctx.save();
  ctx.fillStyle = floorColor;
  
  if (isW3) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(DISPLAY.WIDTH, 0);
    ctx.lineTo(DISPLAY.WIDTH, ceilY);
    for (let x = DISPLAY.WIDTH; x >= 0; x -= 20) {
      const bumpyY = ceilY + Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.closePath();
    ctx.fill();
    
    // Outer Glow Pass (Wide, soft)
    ctx.save();
    ctx.shadowBlur = ceilGlowVal * 1.5;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, ceilY);
    for (let x = 0; x <= DISPLAY.WIDTH; x += 20) {
      const bumpyY = ceilY + Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.stroke();
    ctx.restore();

    // Inner Glow Pass (Narrow, bright white core)
    ctx.save();
    ctx.shadowBlur = ceilGlowVal * 0.4;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, ceilY);
    for (let x = 0; x <= DISPLAY.WIDTH; x += 20) {
      const bumpyY = ceilY + Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // Fill the ceiling solid block
    ctx.fillRect(0, 0, DISPLAY.WIDTH, ceilGlitchY);
    
    // Outer Glow Pass (Wide, soft)
    ctx.save();
    ctx.shadowBlur = ceilGlowVal * 1.5;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = glowColor;
    ctx.fillRect(0, ceilGlitchY - 3, DISPLAY.WIDTH, 3);
    ctx.restore();

    // Inner Glow Pass (Narrow, white core)
    ctx.save();
    ctx.shadowBlur = ceilGlowVal * 0.4;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, ceilGlitchY - 1, DISPLAY.WIDTH, 1);
    ctx.restore();
    
    if (isW2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let gy = 4; gy < ceilGlitchY - 2; gy += 6) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(DISPLAY.WIDTH, gy); ctx.stroke();
      }
      ctx.restore();
    } else if (isW4) {
      ctx.save();
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, ceilGlitchY - 1); ctx.lineTo(DISPLAY.WIDTH, ceilGlitchY - 1); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  
  // Floor Block and Glow Edge
  ctx.save();
  ctx.fillStyle = floorColor;
  
  if (isW3) {
    ctx.beginPath();
    ctx.moveTo(DISPLAY.WIDTH, DISPLAY.HEIGHT);
    ctx.lineTo(0, DISPLAY.HEIGHT);
    ctx.lineTo(0, floorY);
    for (let x = 0; x <= DISPLAY.WIDTH; x += 20) {
      const bumpyY = floorY - Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.closePath();
    ctx.fill();
    
    // Outer Glow Pass (Wide, soft)
    ctx.save();
    ctx.shadowBlur = floorGlowVal * 1.5;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    for (let x = 0; x <= DISPLAY.WIDTH; x += 20) {
      const bumpyY = floorY - Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.stroke();
    ctx.restore();

    // Inner Glow Pass (Narrow, bright white core)
    ctx.save();
    ctx.shadowBlur = floorGlowVal * 0.4;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    for (let x = 0; x <= DISPLAY.WIDTH; x += 20) {
      const bumpyY = floorY - Math.sin(x * 0.05 + gs.distanceTraveled * 0.02) * 4;
      ctx.lineTo(x, bumpyY);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // Fill the floor solid block
    ctx.fillRect(0, floorGlitchY, DISPLAY.WIDTH, DISPLAY.HEIGHT - floorGlitchY);
    
    // Outer Glow Pass (Wide, soft)
    ctx.save();
    ctx.shadowBlur = floorGlowVal * 1.5;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = glowColor;
    ctx.fillRect(0, floorGlitchY, DISPLAY.WIDTH, 3);
    ctx.restore();

    // Inner Glow Pass (Narrow, white core)
    ctx.save();
    ctx.shadowBlur = floorGlowVal * 0.4;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, floorGlitchY, DISPLAY.WIDTH, 1);
    ctx.restore();
    
    if (isW2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let gy = floorGlitchY + 4; gy < DISPLAY.HEIGHT - 4; gy += 6) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(DISPLAY.WIDTH, gy); ctx.stroke();
      }
      ctx.restore();
    } else if (isW4) {
      ctx.save();
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, floorGlitchY + 1); ctx.lineTo(DISPLAY.WIDTH, floorGlitchY + 1); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  
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

function getObstacleColors() {
  if (gs.mode === 'campaign' && gs.campaign) {
    const w = gs.campaign.currentWorld;
    if (w === 2) return { body: '#0088ff', glow: '#00ffff' };
    if (w === 3) return { body: '#887766', glow: '#ffaa00' };
    if (w === 4) return { body: '#ff5500', glow: '#ffff00' };
    if (w === 5) return { body: '#ffffff', glow: '#8800ff' };
    return { body: COLORS.OBSTACLE, glow: COLORS.OBSTACLE_GLOW };
  }
  if (gs.theme === 'neongrid') return { body: '#00ff44', glow: '#00ff44' };
  if (gs.theme === 'crimsonvoid') return { body: '#cc0033', glow: '#ff0022' };
  if (gs.theme === 'aurora') return { body: '#004466', glow: '#00ff88' };
  
  const isMaxBlitz = gs.mode === 'blitz' && gs.speed >= 14;
  if (isMaxBlitz) return { body: COLORS.NEON_ORANGE, glow: '#ffaa44' };
  return { body: COLORS.OBSTACLE, glow: COLORS.OBSTACLE_GLOW };
}

function drawObstacleTrails() {
  ctx.save();
  const alphas = [0.15, 0.08, 0.03];
  const offsets = [8, 16, 24];
  const isMaxBlitz = gs.mode === 'blitz' && gs.speed >= 14;
  const baseColor = isMaxBlitz ? '255,136,0' : '255,80,80';
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    if (o.type !== 'basic') continue;
    for (let t = 0; t < 3; t++) {
      ctx.fillStyle = 'rgba(' + baseColor + ',' + alphas[t] + ')';
      ctx.fillRect(o.x + offsets[t], o.y, o.width, o.height);
    }
  }
  ctx.restore();
}

function drawObstacles() {
  ctx.save();
  const colors = getObstacleColors();
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  const playH = floorY - ceilY;
  
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    let obsColor = colors.body;
    let glowColor = colors.glow;
    
    if (o.type === 'basic') {
      if (o.isAsteroid) {
        ctx.save();
        ctx.translate(o.x + o.width/2, o.y + o.height/2);
        ctx.rotate(o.rotation);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff5500';
        ctx.fillStyle = '#887766';
        ctx.fillRect(-o.width/2, -o.height/2, o.width, o.height);
        
        ctx.strokeStyle = '#554433';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-o.width/2 + 5, -o.height/2 + 5); ctx.lineTo(o.width/2 - 5, o.height/2 - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.width/2 - 5, -o.height/2 + 5); ctx.lineTo(-o.width/2 + 5, o.height/2 - 5); ctx.stroke();
        ctx.restore();
      } else {
        const glow = 8 + 4 * Math.sin(o.glowPhase);
        
        // 1. Draw base block with vertical tech gradient
        ctx.save();
        const blockGrd = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.height);
        blockGrd.addColorStop(0, glowColor);
        blockGrd.addColorStop(0.25, obsColor);
        blockGrd.addColorStop(1, 'rgba(15, 15, 40, 0.95)');
        ctx.fillStyle = blockGrd;
        
        roundRect(ctx, o.x, o.y, o.width, o.height, 4);
        ctx.fill();
        
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        
        // 2. Draw diagonal hazard stripes on the block body
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, o.x, o.y, o.width, o.height, 4);
        ctx.clip();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 5;
        const stripeSpacing = 14;
        for (let sx = o.x - o.height; sx < o.x + o.width; sx += stripeSpacing) {
          ctx.beginPath();
          ctx.moveTo(sx, o.y + o.height);
          ctx.lineTo(sx + o.height, o.y);
          ctx.stroke();
        }
        ctx.restore();

        // 3. Draw glowing spikes on the leading edge (outer neon glow)
        const sH = 10;
        const sW = o.width / 4;
        
        ctx.save();
        ctx.shadowBlur = glow * 1.5;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = glowColor;
        if (o.fromFloor) {
          for (let s = 0; s < 4; s++) {
            const sx = o.x + s * sW;
            ctx.beginPath();
            ctx.moveTo(sx, o.y);
            ctx.lineTo(sx + sW / 2, o.y - sH);
            ctx.lineTo(sx + sW, o.y);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          const bot = o.y + o.height;
          for (let s = 0; s < 4; s++) {
            const sx = o.x + s * sW;
            ctx.beginPath();
            ctx.moveTo(sx, bot);
            ctx.lineTo(sx + sW / 2, bot + sH);
            ctx.lineTo(sx + sW, bot);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();

        // 4. Spikes inner white-hot core
        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = '#ffffff';
        if (o.fromFloor) {
          for (let s = 0; s < 4; s++) {
            const sx = o.x + s * sW;
            ctx.beginPath();
            ctx.moveTo(sx + sW * 0.15, o.y);
            ctx.lineTo(sx + sW / 2, o.y - sH * 0.7);
            ctx.lineTo(sx + sW * 0.85, o.y);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          const bot = o.y + o.height;
          for (let s = 0; s < 4; s++) {
            const sx = o.x + s * sW;
            ctx.beginPath();
            ctx.moveTo(sx + sW * 0.15, bot);
            ctx.lineTo(sx + sW / 2, bot + sH * 0.7);
            ctx.lineTo(sx + sW * 0.85, bot);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }
    } else if (o.type === 'laser') {
      ctx.save();
      const emitterH = 12;
      const emitterW = 20;
      const eX = o.x + o.width/2 - emitterW/2;
      const bY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT - emitterH;
      const laserStartY = DISPLAY.FLOOR_HEIGHT + emitterH;
      const laserEndY = bY;
      const laserLength = laserEndY - laserStartY;

      // 1. Draw Emitter Nozzles (Top and Bottom)
      ctx.save();
      ctx.fillStyle = '#1e1e2f';
      ctx.strokeStyle = '#4e4e6f';
      ctx.lineWidth = 2;
      
      // Top nozzle
      roundRect(ctx, eX, DISPLAY.FLOOR_HEIGHT, emitterW, emitterH, 2);
      ctx.fill(); ctx.stroke();
      
      // Bottom nozzle
      roundRect(ctx, eX, bY, emitterW, emitterH, 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // 2. Nozzle LED lights
      ctx.save();
      let ledColor = '#33cc33';
      if (o.state === 'on') ledColor = '#ff3333';
      else if (o.state === 'warn') ledColor = '#ffaa00';

      ctx.fillStyle = ledColor;
      ctx.shadowBlur = 6;
      ctx.shadowColor = ledColor;
      ctx.beginPath(); ctx.arc(eX + emitterW/2, DISPLAY.FLOOR_HEIGHT + emitterH/2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eX + emitterW/2, bY + emitterH/2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 3. Draw Laser Beam
      if (o.state === 'on') {
        const flicker = 0.85 + 0.15 * Math.random();
        
        // Pass A: Wide soft outer glow
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.25)';
        ctx.lineWidth = (16 + 2 * Math.sin(gs.frameCount * 0.8)) * flicker;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff3333';
        ctx.beginPath();
        ctx.moveTo(o.x + o.width/2, laserStartY);
        ctx.lineTo(o.x + o.width/2, laserEndY);
        ctx.stroke();
        ctx.restore();

        // Pass B: Medium bright glow
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
        ctx.lineWidth = (6 + 1 * Math.sin(gs.frameCount * 1.5)) * flicker;
        ctx.beginPath();
        ctx.moveTo(o.x + o.width/2, laserStartY);
        ctx.lineTo(o.x + o.width/2, laserEndY);
        ctx.stroke();
        ctx.restore();

        // Pass C: Inner white-hot core
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2 * flicker;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(o.x + o.width/2, laserStartY);
        ctx.lineTo(o.x + o.width/2, laserEndY);
        ctx.stroke();
        ctx.restore();

        // 4. Power Rings (Moving energy pulses)
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 220, 220, 0.75)';
        ctx.lineWidth = 1;
        const ringSpeed = 3;
        const rHeight = 3;
        const t1 = (gs.frameCount * ringSpeed) % laserLength;
        const t2 = ((gs.frameCount * ringSpeed) + laserLength / 2) % laserLength;

        [t1, t2].forEach(offset => {
          const ry = laserStartY + offset;
          ctx.beginPath();
          ctx.ellipse(o.x + o.width/2, ry, 6, rHeight, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();

        // 5. Lens Flares at Top/Bottom nozzle outlets
        ctx.save();
        [laserStartY, laserEndY].forEach(flareY => {
          const flareGrd = ctx.createRadialGradient(o.x + o.width/2, flareY, 1, o.x + o.width/2, flareY, 9);
          flareGrd.addColorStop(0, '#ffffff');
          flareGrd.addColorStop(0.3, '#ff3333');
          flareGrd.addColorStop(1, 'rgba(255, 50, 50, 0)');
          ctx.fillStyle = flareGrd;
          ctx.beginPath();
          ctx.arc(o.x + o.width/2, flareY, 9, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

      } else if (o.state === 'warn') {
        const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.4);
        
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 187, 0, ' + pulse + ')';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffbb00';
        ctx.beginPath();
        ctx.moveTo(o.x + o.width/2, laserStartY);
        ctx.lineTo(o.x + o.width/2, laserEndY);
        ctx.stroke();
        ctx.restore();
        
        // Minor lens flare pulse for warning
        ctx.save();
        [laserStartY, laserEndY].forEach(flareY => {
          const flareGrd = ctx.createRadialGradient(o.x + o.width/2, flareY, 0.5, o.x + o.width/2, flareY, 5);
          flareGrd.addColorStop(0, 'rgba(255, 255, 255, ' + pulse + ')');
          flareGrd.addColorStop(1, 'rgba(255, 187, 0, 0)');
          ctx.fillStyle = flareGrd;
          ctx.beginPath();
          ctx.arc(o.x + o.width/2, flareY, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
      
      // Draw Laser Label
      ctx.fillStyle = o.state === 'on' ? '#ff4444' : '#888899';
      ctx.font = 'bold 8px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 0;
      ctx.fillText('LASER', o.x + o.width/2, laserStartY + 12);
      ctx.restore();
    } else if (o.type === 'crusher') {
      ctx.save();
      
      // 1. Draw base block with deep metallic color & round corners
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff5500';
      ctx.fillStyle = '#22222c';
      roundRect(ctx, o.x, o.y, o.width, o.height, 6);
      ctx.fill();
      
      // 2. Draw industrial warning diagonal stripes inside the body
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, o.x, o.y, o.width, o.height, 6);
      ctx.clip();
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let sx = o.x - 40; sx < o.x + o.width + 40; sx += 15) {
        ctx.moveTo(sx, o.y);
        ctx.lineTo(sx + 15, o.y + o.height);
      }
      ctx.stroke();
      ctx.restore();
      
      // Outer border outline
      ctx.strokeStyle = '#44445c';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.width, o.height);
      
      // 3. Draw Rivets/Bolts at 4 corners
      ctx.fillStyle = '#77778f';
      ctx.strokeStyle = '#11111a';
      ctx.lineWidth = 1;
      const boltPadding = 6;
      const boltRadius = 2.5;
      const bolts = [
        { x: o.x + boltPadding, y: o.y + boltPadding },
        { x: o.x + o.width - boltPadding, y: o.y + boltPadding },
        { x: o.x + boltPadding, y: o.y + o.height - boltPadding },
        { x: o.x + o.width - boltPadding, y: o.y + o.height - boltPadding }
      ];
      bolts.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, boltRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Shiny reflection dot on rivet
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - 1, b.y - 1, 1, 1);
        ctx.fillStyle = '#77778f'; // reset
      });
      
      // 4. Crushing Face Glow Highlight (glowing neon edge where impact happens)
      ctx.save();
      const faceY = o.moveDirection === -1 ? o.y + o.height : o.y;
      
      // Outer glow
      ctx.strokeStyle = '#ff3300';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff3300';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o.x + 2, faceY);
      ctx.lineTo(o.x + o.width - 2, faceY);
      ctx.stroke();
      
      // Inner bright core
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 3;
      ctx.shadowColor = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(o.x + 4, faceY);
      ctx.lineTo(o.x + o.width - 4, faceY);
      ctx.stroke();
      ctx.restore();
      
      // 5. Draw Warning Ticker Line on floor/ceiling prior to impact slam
      if (o.moveTimer >= 1700) {
        const targetY = o.moveDirection === -1 ? ceilY : floorY;
        ctx.save();
        ctx.strokeStyle = '#ff3300';
        ctx.lineWidth = 3 + Math.sin(gs.frameCount * 0.5) * 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff3300';
        ctx.beginPath();
        ctx.moveTo(o.x - 10, targetY);
        ctx.lineTo(o.x + o.width + 10, targetY);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (o.type === 'phantom') {
      ctx.save();
      ctx.globalAlpha = o.revealed ? 0.15 : 0.4;
      ctx.fillStyle = o.revealed ? '#00ff44' : '#aa44ff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = o.revealed ? '#00ff44' : '#aa44ff';
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.strokeStyle = o.revealed ? '#00ff44' : '#aa44ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.width, o.height);
      
      ctx.globalAlpha = o.revealed ? 0.3 : 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.revealed ? 'OK' : '?', o.x + o.width / 2, o.y + o.height / 2);
      ctx.restore();
    } else if (o.type === 'saw') {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rotation);
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#888888';
      ctx.fillStyle = '#cccccc';
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, o.radius - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#cccccc';
      for (let tooth = 0; tooth < 8; tooth++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(o.radius - 4, -3);
        ctx.lineTo(o.radius + 4, 0);
        ctx.lineTo(o.radius - 4, 3);
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (o.type === 'drone') {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffbb00';
      ctx.fillStyle = '#333333';
      ctx.strokeStyle = '#ffbb00';
      ctx.lineWidth = 2;
      roundRect(ctx, o.x, o.y, o.width, o.height, 6);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(o.x + 10, o.y + 10, 8, 10);
      ctx.fillRect(o.x + o.width - 18, o.y + 10, 8, 10);
      
      ctx.fillStyle = '#ffbb00';
      ctx.fillRect(o.x + 25, o.y + 8, 30, 14);
      ctx.restore();
    } else if (o.type === 'firewave') {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff3300';
      const grd = ctx.createLinearGradient(o.x, 0, o.x + o.width, 0);
      grd.addColorStop(0, 'rgba(255,50,0,0.8)');
      grd.addColorStop(0.5, 'rgba(255,200,0,0.9)');
      grd.addColorStop(1, 'rgba(255,50,0,0.2)');
      ctx.fillStyle = grd;
      roundRect(ctx, o.x, o.y, o.width, o.height, 4);
      ctx.fill();
      
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.width, o.height);
      ctx.restore();
    } else if (o.type === 'inversion') {
      ctx.save();
      ctx.fillStyle = 'rgba(128, 128, 128, 0.15)';
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.strokeRect(o.x, o.y, o.width, o.height);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '8px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INVERSION ZONE', o.x + o.width / 2, o.y + 12);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawStars() {
  ctx.save();
  for (let i = 0; i < gs.stars.length; i++) {
    const s = gs.stars[i];
    const pulse = 1 + 0.2 * Math.sin(s.phase);
    const r = 7.5 * pulse;
    const shape = s.shape || 'star';
    
    // Calculate 3D flip scale for coin/crystal
    const flipScale = Math.sin(gs.frameCount * 0.08 + i);
    
    ctx.save();
    
    if (shape === 'star') {
      // 4-point glowing star
      ctx.shadowBlur = (10 + 5 * Math.sin(s.phase)) * 1.2;
      ctx.shadowColor = COLORS.STAR;
      ctx.fillStyle = COLORS.STAR;
      
      // Outer sparkle
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(gs.frameCount * 0.015 + i);
      draw4PointStarPath(ctx, 0, 0, 4, r * 1.2, r * 0.35);
      ctx.fill();
      ctx.restore();
      
      // Inner white core
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(gs.frameCount * 0.015 + i);
      draw4PointStarPath(ctx, 0, 0, 4, r * 0.5, r * 0.15);
      ctx.fill();
      ctx.restore();
      
    } else if (shape === 'coin') {
      ctx.shadowBlur = (10 + 5 * Math.sin(s.phase)) * 1.2;
      ctx.shadowColor = '#ffd700';
      ctx.fillStyle = '#ffd700';
      
      ctx.translate(s.x, s.y);
      ctx.scale(Math.abs(flipScale) < 0.1 ? 0.1 : flipScale, 1);
      
      // Outer gold circle
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner detail
      ctx.fillStyle = '#111133';
      ctx.font = 'bold ' + Math.floor(r * 1.2) + 'px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0);
      
    } else if (shape === 'crystal') {
      ctx.shadowBlur = (10 + 5 * Math.sin(s.phase)) * 1.2;
      ctx.shadowColor = '#aa00ff';
      ctx.fillStyle = '#aa00ff';
      
      ctx.translate(s.x, s.y);
      ctx.scale(Math.abs(flipScale) < 0.1 ? 0.1 : flipScale, 1);
      ctx.rotate(Math.PI / 4); // Turn into diamond
      
      // Outer diamond
      ctx.fillRect(-r, -r, r * 2, r * 2);
      
      // Inner diamond
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
      
    } else if (shape === 'orb') {
      // Plasma orb with radial gradient
      ctx.translate(s.x, s.y);
      const radGrd = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.3);
      radGrd.addColorStop(0, '#ffffff');
      radGrd.addColorStop(0.3, '#00ffff');
      radGrd.addColorStop(0.8, 'rgba(0, 100, 255, 0.6)');
      radGrd.addColorStop(1, 'rgba(0, 100, 255, 0)');
      
      ctx.shadowBlur = 12 + 6 * Math.sin(s.phase);
      ctx.shadowColor = '#00ffff';
      ctx.fillStyle = radGrd;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw outer plasma ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + 0.15 * Math.sin(gs.frameCount * 0.1)), 0, Math.PI * 2);
      ctx.stroke();
      
    } else if (shape === 'rainbow') {
      const hue = (gs.frameCount * 2.5 + i * 20) % 360;
      const color = 'hsl(' + hue + ', 100%, 60%)';
      ctx.shadowBlur = 12 + 6 * Math.sin(s.phase);
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      
      ctx.translate(s.x, s.y);
      ctx.rotate(-gs.frameCount * 0.03 + i);
      
      // Rainbow star sparkle
      draw4PointStarPath(ctx, 0, 0, 4, r * 1.2, r * 0.35);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      draw4PointStarPath(ctx, 0, 0, 4, r * 0.4, r * 0.12);
      ctx.fill();
    }
    
    ctx.restore();
  }
  ctx.restore();
}

function draw4PointStarPath(c, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;

  c.beginPath();
  c.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    c.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    c.lineTo(x, y);
    rot += step;
  }
  c.lineTo(cx, cy - outerRadius);
  c.closePath();
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
  ctx.textBaseline = 'top';

  // Apply default text drop shadow for clarity against stars/nebula
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Header: SCORE
  ctx.font = 'bold 10px "Orbitron", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 16, 12);

  // Score value: Colored and glowing based on current mode
  let scoreColor = COLORS.NEON_CYAN;
  if (gs.mode === 'mirror') scoreColor = COLORS.NEON_PINK;
  else if (gs.mode === 'blitz') scoreColor = COLORS.NEON_ORANGE;
  else if (gs.mode === 'campaign') scoreColor = '#ffd700';

  ctx.font = '900 24px "Orbitron", monospace';
  ctx.fillStyle = scoreColor;
  ctx.shadowColor = scoreColor;
  ctx.shadowBlur = 10;
  ctx.fillText(gs.score.toString(), 16, 24);

  // Reset shadow for minor HUD details to avoid blurriness, use crisp black backing instead
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // DISTANCE
  ctx.font = 'bold 10px "Orbitron", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('DIST ' + Math.floor(gs.distanceTraveled) + 'm', 16, 52);

  // Header: BEST / STARS
  ctx.textAlign = 'right';
  ctx.font = 'bold 10px "Orbitron", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.shadowBlur = 0;
  ctx.fillText(gs.mode === 'campaign' ? 'STARS' : 'BEST', DISPLAY.WIDTH - 16, 12);

  // High score / Star Count value
  if (gs.mode === 'campaign' && gs.campaign) {
    const progress = loadCampaignProgress();
    let totalStars = 0;
    progress.starsPerWorld.forEach(s => totalStars += s);
    ctx.font = '900 18px "Orbitron", monospace';
    ctx.fillStyle = '#ffd700'; // Gold glow for stars
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.fillText(totalStars + ' / 15', DISPLAY.WIDTH - 16, 24);
  } else {
    ctx.font = '900 18px "Orbitron", monospace';
    ctx.fillStyle = '#00ffaa'; // Cyber green glow for best high score
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 8;
    ctx.fillText(gs.highScore.toString(), DISPLAY.WIDTH - 16, 24);
  }

  // Reset shadow for world/zone label
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';

  // Zone or World badge
  if (gs.mode === 'campaign' && gs.campaign) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Orbitron", monospace';
    ctx.fillStyle = '#ffd700'; // Gold
    ctx.fillText('WORLD ' + gs.campaign.currentWorld, DISPLAY.WIDTH / 2, 24);
    
    // Remaining goal distance
    ctx.font = 'bold 10px "Orbitron", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    const remaining = Math.max(0, Math.floor(gs.campaign.distanceGoal - gs.distanceTraveled));
    if (remaining > 0) {
      ctx.fillText('GOAL: ' + remaining + 'm', DISPLAY.WIDTH / 2, 38);
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.fillText('GOAL REACHED! RUN FOR BONUS STARS!', DISPLAY.WIDTH / 2, 38);
    }
    
    // Progress Bar at bottom of screen
    const w = gs.campaign.currentWorld;
    const progressVal = Math.min(1, gs.distanceTraveled / gs.campaign.distanceGoal);
    const barH = 4;
    const barY = DISPLAY.HEIGHT - barH;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, barY, DISPLAY.WIDTH, barH);
    
    let barColor = '#ffd700';
    if (w === 2) barColor = '#00ffff';
    else if (w === 3) barColor = '#ffaa00';
    else if (w === 4) barColor = '#ff5500';
    else if (w === 5) barColor = '#8800ff';
    
    ctx.fillStyle = barColor;
    ctx.fillRect(0, barY, DISPLAY.WIDTH * progressVal, barH);
  } else {
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Orbitron", monospace';
    let zc = 'rgba(255,255,255,0.6)';
    if (gs.currentZone >= 4) zc = 'rgba(255,60,60,0.85)';
    else if (gs.currentZone === 3) zc = 'rgba(180,80,255,0.85)';
    else if (gs.currentZone === 2) zc = 'rgba(80,120,255,0.85)';
    ctx.fillStyle = zc;
    ctx.fillText('ZONE ' + gs.currentZone, DISPLAY.WIDTH / 2, 24);
  }

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

  // Heat Pulse Center warning
  if (gs.mode === 'campaign' && gs.campaign && gs.campaign.currentWorld === 4) {
    if (gs.campaign.heatPulseTimer >= 6500 && gs.campaign.heatPulseTimer < 8000) {
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.2);
      ctx.fillStyle = 'rgba(255, 0, 0, ' + pulse + ')';
      ctx.font = 'bold 26px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff3300';
      ctx.fillText('HEAT PULSE!', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawModeBadge() {
  if (gs.screen !== 'playing' && gs.screen !== 'paused') return;
  ctx.save();
  const mColors = { classic: COLORS.NEON_CYAN, mirror: COLORS.NEON_PINK, blitz: COLORS.NEON_ORANGE, campaign: '#ffd700' };
  const mNames = { classic: 'CLASSIC', mirror: 'MIRROR', blitz: 'BLITZ', campaign: 'CAMPAIGN' };
  const color = mColors[gs.mode]; const name = mNames[gs.mode];
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '9px Orbitron, monospace'; ctx.fillStyle = color;
  const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.08);
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(DISPLAY.WIDTH / 2 - 38, 15, 3, 0, Math.PI * 2);
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
  ctx.save();
  ctx.fillStyle = 'rgba(255,50,50,' + alpha + ')';
  if (gs.mode === 'mirror' && gs.killedBy) {
    if (gs.killedBy === 'p1') {
      ctx.fillRect(0, 0, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT);
    } else if (gs.killedBy === 'p2') {
      ctx.fillRect(DISPLAY.WIDTH / 2, 0, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT);
    } else {
      ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
    }
  } else {
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  }
  ctx.restore();
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

function drawCampaignIcon(cx, cy, color) {
  ctx.save();
  // Planet body
  ctx.fillStyle = color;
  ctx.shadowBlur = 10; ctx.shadowColor = color;
  ctx.beginPath(); ctx.arc(cx - 3, cy + 3, 9, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  
  // Planet ring
  ctx.strokeStyle = '#ffa500';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy + 3, 14, 4, Math.PI/6, 0, Math.PI * 2);
  ctx.stroke();
  
  // Flagpole
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy + 3);
  ctx.lineTo(cx - 3, cy - 12);
  ctx.stroke();
  
  // Flag triangle (gold)
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 12);
  ctx.lineTo(cx + 7, cy - 8);
  ctx.lineTo(cx - 3, cy - 4);
  ctx.closePath();
  ctx.fill();
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
  ctx.fillText('SELECT MODE', DISPLAY.WIDTH / 2, 52);
  ctx.shadowBlur = 0;

  const cardW = 150, cardH = 210, gap = 16;
  const totalW = cardW * 4 + gap * 3;
  const startX = (DISPLAY.WIDTH - totalW) / 2;
  const cardY = 80;

  const modes = [
    { name: 'CLASSIC', desc: ['The original.', 'Survive as long as you can.'], color: COLORS.NEON_CYAN, icon: drawClassicIcon },
    { name: 'MIRROR', desc: ['Two players. One screen.', 'Both must survive.'], color: COLORS.NEON_PINK, icon: drawMirrorIcon },
    { name: 'BLITZ', desc: ['Speed keeps rising.', 'Never slows down.'], color: COLORS.NEON_ORANGE, icon: drawBlitzIcon },
    { name: 'CAMPAIGN', desc: ['5 worlds. Each with', 'a unique challenge.'], color: '#ffd700', icon: drawCampaignIcon }
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
    ctx.font = 'bold 16px Orbitron, monospace';
    ctx.fillText(m.name, x + cardW / 2, cardY + 105);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Orbitron, monospace';
    m.desc.forEach((line, li) => {
      ctx.fillText(line, x + cardW / 2, cardY + 132 + li * 15);
    });

    // Stats under the cards
    if (i === 3) {
      // Campaign progress planet indicator
      const progress = loadCampaignProgress();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '9px Orbitron, monospace';
      const wText = progress.world > 5 ? 'All Complete!' : 'World ' + progress.world + '/5';
      ctx.fillText(wText, x + cardW / 2, cardY + cardH - 35);
      
      const dotRadius = 4;
      const dotGap = 12;
      const dotStartX = x + cardW / 2 - (dotGap * 2);
      const dotY = cardY + cardH - 18;
      for (let pIdx = 0; pIdx < 5; pIdx++) {
        const px = dotStartX + pIdx * dotGap;
        const completed = (pIdx + 1 < progress.world) || (progress.world > 5);
        ctx.fillStyle = completed ? '#ffd700' : '#555555';
        ctx.beginPath();
        ctx.arc(px, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        if (completed) {
          ctx.strokeStyle = '#ffa500';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, dotY, dotRadius + 3, dotRadius - 2, Math.PI/6, 0, Math.PI*2);
          ctx.stroke();
        }
      }
    } else {
      const modeBest = loadHighScore(['classic', 'mirror', 'blitz'][i]);
      if (modeBest > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '9px Orbitron, monospace';
        ctx.fillText('BEST: ' + modeBest, x + cardW / 2, cardY + cardH - 18);
      }
    }
  });

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + pulse * 0.3) + ')';
  ctx.font = '12px Orbitron, monospace';
  ctx.fillText('\u2190 \u2192 TO SELECT    SPACE TO CONFIRM', DISPLAY.WIDTH / 2, cardY + cardH + 32);

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

  ctx.shadowBlur = 20;
  if (gs.mode === 'campaign' && gs.campaign) {
    ctx.shadowColor = '#ff3333';
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 44px Orbitron, monospace';
    ctx.fillText('WORLD FAILED', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.25);
  } else if (gs.mode === 'mirror' && gs.killedBy) {
    if (gs.killedBy === 'p1') {
      ctx.shadowColor = COLORS.NEON_CYAN;
      ctx.fillStyle = COLORS.NEON_CYAN;
      ctx.font = 'bold 44px Orbitron, monospace';
      ctx.fillText('P1 CRASHED!', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.25);
    } else {
      ctx.shadowColor = COLORS.NEON_PINK;
      ctx.fillStyle = COLORS.NEON_PINK;
      ctx.font = 'bold 44px Orbitron, monospace';
      ctx.fillText('P2 CRASHED!', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.25);
    }
  } else {
    ctx.shadowColor = COLORS.OBSTACLE;
    ctx.fillStyle = COLORS.OBSTACLE;
    ctx.font = 'bold 48px Orbitron, monospace';
    ctx.fillText('GAME OVER', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.25);
  }

  ctx.shadowBlur = 0;
  if (gs.mode === 'campaign' && gs.campaign) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Orbitron, monospace';
    ctx.fillText('DISTANCE REACHED', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.35);
    ctx.fillStyle = COLORS.TEXT;
    ctx.font = 'bold 28px Orbitron, monospace';
    ctx.fillText(Math.floor(gs.distanceTraveled) + 'm / ' + gs.campaign.distanceGoal + 'm', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.42);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px Orbitron, monospace';
    ctx.fillText('SCORE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.35);
    ctx.fillStyle = COLORS.TEXT;
    ctx.font = 'bold 28px Orbitron, monospace';
    ctx.fillText(gs.score.toString(), DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.42);
  }

  // Mode stats
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px Orbitron, monospace';
  if (gs.mode === 'campaign' && gs.campaign) {
    ctx.fillText('Retries: ' + gs.campaign.deathCount, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  } else if (gs.mode === 'classic') {
    const secs = Math.floor(gs.modeStats.playTimeMs / 1000);
    ctx.fillText('Survived ' + secs + 's  \u2502  Stars: ' + gs.modeStats.starsCollected, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  } else if (gs.mode === 'mirror') {
    const who = gs.modeStats.whoDied === 'p2' ? 'P2 died' : 'P1 died';
    ctx.fillText(who + '  \u2502  Flips: ' + gs.modeStats.syncFlips, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  } else if (gs.mode === 'blitz') {
    ctx.fillText('Max speed: ' + gs.modeStats.maxSpeedReached.toFixed(1) + '  \u2502  Zones: ' + gs.modeStats.zonesCleared, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.52);
  }

  if (gs.mode !== 'campaign' && gs.newBest) {
    const sparkle = 0.7 + 0.3 * Math.sin(gs.frameCount * 0.12);
    ctx.shadowBlur = 12; ctx.shadowColor = COLORS.STAR;
    ctx.fillStyle = 'rgba(255,221,0,' + sparkle + ')';
    ctx.font = 'bold 20px Orbitron, monospace';
    ctx.fillText('\u2726 NEW BEST \u2726', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.58);
  }

  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.shadowBlur = 4;

  // Leaderboard button hint
  if (gs.mode !== 'campaign') {
    ctx.fillStyle = 'rgba(0,255,255,' + (0.3 + pulse * 0.3) + ')';
    ctx.font = '11px Orbitron, monospace';
    ctx.fillText('[L] LEADERBOARD    [S] SUBMIT SCORE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.68);
  }

  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  if (gs.mode === 'campaign') {
    ctx.fillText('PRESS SPACE OR TAP TO RETRY', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.82);
  } else {
    ctx.fillText('PRESS SPACE OR TAP TO CONTINUE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.82);
  }
  ctx.restore();
}

function isPlayerInInversionZone(p) {
  if (!gs.obstacles) return null;
  for (let i = 0; i < gs.obstacles.length; i++) {
    const o = gs.obstacles[i];
    if (o.type === 'inversion') {
      if (p.x + p.width > o.x && p.x < o.x + o.width) {
        return o;
      }
    }
  }
  return null;
}

function updateSpecialRules(dt) {
  if (gs.mode !== 'campaign' || !gs.campaign) return;
  const w = gs.campaign.currentWorld;
  const floorY = DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT;
  const ceilY = DISPLAY.FLOOR_HEIGHT;
  const playH = floorY - ceilY;
  
  // World 2: spawn drone every 300 distance
  if (w === 2) {
    gs.campaign.lastDroneDistance = gs.campaign.lastDroneDistance || 0;
    if (gs.distanceTraveled - gs.campaign.lastDroneDistance >= 300) {
      gs.campaign.lastDroneDistance = gs.distanceTraveled;
      gs.obstacles.push({
        type: 'drone',
        x: DISPLAY.WIDTH + 50,
        y: ceilY + (playH - 30) / 2,
        width: 80, height: 30,
        glowPhase: 0
      });
    }
  }
  
  // World 4: Heat Pulse warning and firewave
  if (w === 4) {
    gs.campaign.heatPulseTimer = (gs.campaign.heatPulseTimer || 0) + dt * 16.67;
    if (gs.campaign.heatPulseTimer >= 8000) {
      gs.campaign.heatPulseTimer = 0;
      gs.obstacles.push({
        type: 'firewave',
        x: DISPLAY.WIDTH + 50,
        y: ceilY + (playH - 60) / 2,
        width: 80, height: 60,
        glowPhase: 0
      });
      // Play low rumble sound
      if (audioCtx) {
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(90, t);
        o.frequency.linearRampToValueAtTime(30, t + 0.6);
        g.gain.setValueAtTime(0.15, t);
        g.gain.linearRampToValueAtTime(0, t + 0.6);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 0.65);
      }
    }
  }
  
  // World 5: Inversion Zones spawn every 700 distance
  if (w === 5) {
    gs.campaign.lastInversionZoneDist = gs.campaign.lastInversionZoneDist || 0;
    if (gs.distanceTraveled - gs.campaign.lastInversionZoneDist >= 700) {
      gs.campaign.lastInversionZoneDist = gs.distanceTraveled;
      gs.obstacles.push({
        type: 'inversion',
        x: DISPLAY.WIDTH + 50,
        y: ceilY,
        width: 60, height: playH,
        glowPhase: 0
      });
    }
  }
  
  // Gravity Inversion zones automatic flipping
  const p = gs.player;
  if (p && p.alive) {
    const zone = isPlayerInInversionZone(p);
    if (zone) {
      if (p.lastInversionZone !== zone) {
        p.lastInversionZone = zone;
        flipGravity();
      }
    } else {
      p.lastInversionZone = null;
    }
  }
}
function drawThemeBadge() {
  if (gs.themeBadgeTimer <= 0 || !gs.themeBadgeName) return;
  ctx.save();
  let alpha = 1;
  if (gs.themeBadgeTimer > 150) {
    alpha = (180 - gs.themeBadgeTimer) / 30;
  } else if (gs.themeBadgeTimer < 30) {
    alpha = gs.themeBadgeTimer / 30;
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px Orbitron, monospace';
  
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffd700';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('THEME UNLOCKED: ' + gs.themeBadgeName, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT - DISPLAY.FLOOR_HEIGHT - 25);
  ctx.restore();
}

function drawWorldCompleteScreen() {
  if (gs.screen !== 'worldcomplete') return;
  ctx.fillStyle = 'rgba(10,10,26,0.85)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  
  const w = gs.campaign.currentWorld;
  let wColor = '#ffd700';
  if (w === 2) wColor = '#00ffff';
  else if (w === 3) wColor = '#ffaa00';
  else if (w === 4) wColor = '#ff5500';
  else if (w === 5) wColor = '#8800ff';
  
  ctx.shadowBlur = 15; ctx.shadowColor = wColor;
  ctx.fillStyle = wColor;
  ctx.font = 'bold 36px Orbitron, monospace';
  ctx.fillText('WORLD ' + w + ' COMPLETE', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.22);
  ctx.shadowBlur = 0;
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Orbitron, monospace';
  ctx.fillText(gs.campaign.message, DISPLAY.WIDTH / 2, DISPLAY.HEIGHT * 0.32);
  
  if (!gs.worldCompleteAnimTimer) gs.worldCompleteAnimTimer = 0;
  gs.worldCompleteAnimTimer += 1;
  
  const earned = gs.campaign.earnedStars || [1, 0, 0];
  const starPositions = [
    { x: DISPLAY.WIDTH / 2 - 60, y: DISPLAY.HEIGHT * 0.48 },
    { x: DISPLAY.WIDTH / 2, y: DISPLAY.HEIGHT * 0.46 },
    { x: DISPLAY.WIDTH / 2 + 60, y: DISPLAY.HEIGHT * 0.48 }
  ];
  
  const starDescriptions = [
    'Completed World',
    'Zero Deaths Run',
    'Bonus 500+ Meters'
  ];
  
  ctx.font = '10px Orbitron, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  
  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const delay = (sIdx + 1) * 30;
    const pos = starPositions[sIdx];
    
    ctx.fillText(starDescriptions[sIdx], pos.x, pos.y + 35);
    
    if (gs.worldCompleteAnimTimer >= delay) {
      const hasStar = earned[sIdx];
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      
      const popProgress = Math.min(1, (gs.worldCompleteAnimTimer - delay) / 15);
      const scale = 1 + (1 - popProgress) * 0.5;
      
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);
      
      if (hasStar) {
        ctx.fillStyle = '#ffd700';
        ctx.shadowBlur = 15; ctx.shadowColor = '#ffd700';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText('\u2726', 0, 0);
      } else {
        ctx.fillStyle = '#444444';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText('\u2727', 0, 0);
      }
      ctx.restore();
    }
  }
  
  if (gs.worldCompleteAnimTimer >= 100) {
    const selIdx = gs.worldCompleteSelectIndex || 0;
    const bY = DISPLAY.HEIGHT * 0.76;
    const btnW = 160;
    const btnH = 36;
    
    const b1X = DISPLAY.WIDTH / 2 - btnW - 20;
    ctx.fillStyle = selIdx === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, b1X, bY, btnW, btnH, 6); ctx.fill();
    ctx.strokeStyle = selIdx === 0 ? wColor : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = selIdx === 0 ? 2 : 1;
    roundRect(ctx, b1X, bY, btnW, btnH, 6); ctx.stroke();
    
    ctx.fillStyle = selIdx === 0 ? wColor : '#aaaaaa';
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.fillText(w === 5 ? 'CHAMPION SCREEN' : 'NEXT WORLD', b1X + btnW / 2, bY + btnH / 2);
    
    const b2X = DISPLAY.WIDTH / 2 + 20;
    ctx.fillStyle = selIdx === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, b2X, bY, btnW, btnH, 6); ctx.fill();
    ctx.strokeStyle = selIdx === 1 ? wColor : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = selIdx === 1 ? 2 : 1;
    roundRect(ctx, b2X, bY, btnW, btnH, 6); ctx.stroke();
    
    ctx.fillStyle = selIdx === 1 ? wColor : '#aaaaaa';
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.fillText('RETRY WORLD', b2X + btnW / 2, bY + btnH / 2);
    
    const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + pulse * 0.3) + ')';
    ctx.font = '10px Orbitron, monospace';
    ctx.fillText('\u2190 \u2192 TO SELECT    SPACE TO CONFIRM', DISPLAY.WIDTH / 2, bY + btnH + 20);
  }
  
  ctx.restore();
}

function drawGameCompleteScreen() {
  if (gs.screen !== 'gamecomplete') return;
  ctx.fillStyle = 'rgba(10,10,26,0.92)';
  ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT);
  
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  
  ctx.shadowBlur = 25; ctx.shadowColor = '#ffd700';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 36px Orbitron, monospace';
  ctx.fillText('YOU ARE THE', DISPLAY.WIDTH / 2, 70);
  ctx.font = 'bold 44px Orbitron, monospace';
  ctx.fillText('GRAVFLIP CHAMPION!', DISPLAY.WIDTH / 2, 120);
  ctx.shadowBlur = 0;
  
  const progress = loadCampaignProgress();
  let totalStars = 0;
  progress.starsPerWorld.forEach(s => totalStars += s);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Orbitron, monospace';
  ctx.fillText('TOTAL STARS: ' + totalStars + ' / 15', DISPLAY.WIDTH / 2, 180);
  
  const startX = DISPLAY.WIDTH / 2 - 200;
  const spacing = 100;
  const pY = 250;
  
  const wNames = ['VOID', 'CITY', 'BELT', 'FLARE', 'SINGULARITY'];
  const wColors = ['#00ffff', '#00ff44', '#ffaa00', '#ff5500', '#8800ff'];
  
  for (let i = 0; i < 5; i++) {
    const px = startX + i * spacing;
    ctx.fillStyle = wColors[i];
    ctx.beginPath();
    ctx.arc(px, pY, 12, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(px, pY, 18, 5, Math.PI/6, 0, Math.PI*2);
    ctx.stroke();
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px Orbitron, monospace';
    ctx.fillText(wNames[i], px, pY + 28);
    
    const starsCount = progress.starsPerWorld[i] || 0;
    ctx.fillStyle = '#ffd700';
    ctx.font = '12px Orbitron, monospace';
    let starsStr = '';
    for (let s = 0; s < 3; s++) {
      starsStr += s < starsCount ? '\u2726' : '\u2727';
    }
    ctx.fillText(starsStr, px, pY + 42);
  }
  
  const pulse = 0.4 + 0.6 * Math.sin(gs.frameCount * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + pulse * 0.4) + ')';
  ctx.font = '14px Orbitron, monospace';
  ctx.fillText('PRESS SPACE OR TAP FOR MAIN MENU', DISPLAY.WIDTH / 2, DISPLAY.HEIGHT - 50);
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
  if (gs.screen === 'playing' && gs.player.alive && (gs.mode !== 'mirror' || (gs.player2 && gs.player2.alive))) {
    updateSpecialRules(dt);
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

    // Update theme transition
    if (gs.themeTransition && gs.themeTransition.active) {
      gs.themeTransition.progress += dt;
      if (gs.themeTransition.progress >= 60) {
        gs.themeTransition.active = false;
      }
    }

    // Update theme badge timer
    if (gs.themeBadgeTimer > 0) {
      gs.themeBadgeTimer -= dt;
    }

    gs.frameCount++;

  } else if (gs.screen === 'playing' && (!gs.player.alive || (gs.mode === 'mirror' && gs.player2 && !gs.player2.alive))) {
    updateParticles(dt);
    updateScreenShake(dt);
    updateDeathFlash(dt);
    gs.deathDelay -= dt;
    gs.frameCount++;
    if (gs.deathDelay <= 0) {
      // Check Campaign Completion
      if (gs.mode === 'campaign' && gs.campaign && gs.distanceTraveled >= gs.campaign.distanceGoal) {
        gs.screen = 'worldcomplete';
        gs.worldCompleteAnimTimer = 0;
        gs.worldCompleteSelectIndex = 0;
        
        // Calculate stars
        const wIdx = gs.campaign.currentWorld - 1;
        const s1 = 1;
        const s2 = gs.campaign.deathCount === 0 ? 1 : 0;
        const s3 = (gs.distanceTraveled - gs.campaign.distanceGoal) >= 500 ? 1 : 0;
        gs.campaign.earnedStars = [s1, s2, s3];
        
        // Save progress
        const prog = loadCampaignProgress();
        const earnedCount = s1 + s2 + s3;
        if (earnedCount > (prog.starsPerWorld[wIdx] || 0)) {
          prog.starsPerWorld[wIdx] = earnedCount;
        }
        if (prog.world === gs.campaign.currentWorld && prog.world < 5) {
          prog.world = gs.campaign.currentWorld + 1;
        } else if (prog.world === 5 && gs.campaign.currentWorld === 5) {
          prog.world = 6; // Campaign completely finished
        }
        saveCampaignProgress(prog);
      } else {
        gs.screen = 'dead';
      }
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
    if (gs.newBest && gs.mode !== 'campaign' && !gs.namePromptShown) {
      gs.newBestTimer += dt * 16.67;
      if (gs.newBestTimer >= 1000) {
        gs.namePromptShown = true;
        showNameEntry(gs.score);
      }
    }
  } else if (gs.screen === 'worldcomplete') {
    gs.frameCount++;
  } else if (gs.screen === 'gamecomplete') {
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
  drawThemeBadge();
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
  drawWorldCompleteScreen();
  drawGameCompleteScreen();

  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
// Initialize API session (non-blocking, game works offline)
API.init().catch(() => {});

// Enforce Orbitron font rendering consistency by waiting for font load
if (document.fonts && typeof document.fonts.ready === 'object') {
  Promise.race([
    document.fonts.ready,
    new Promise(resolve => setTimeout(resolve, 1000))
  ]).then(() => {
    requestAnimationFrame(gameLoop);
  });
} else {
  requestAnimationFrame(gameLoop);
}
