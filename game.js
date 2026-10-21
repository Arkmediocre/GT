const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const statusEl = document.querySelector('#status');
const stageMessage = document.querySelector('#stageMessage');
const levelTitle = document.querySelector('#levelTitle');
const levelProgress = document.querySelector('#levelProgress');
const screenSizeInput = document.querySelector('#screenSizeInput');
const screenSizeLabel = document.querySelector('#screenSizeLabel');
const stageWrap = document.querySelector('#stageWrap');
const fullscreenButton = document.querySelector('#fullscreenButton');
const stageFullscreenButton = document.querySelector('#stageFullscreenButton');
const rotateButton = document.querySelector('#rotateButton');
const musicButton = document.querySelector('#musicButton');
const SCREEN_SIZE_KEY = 'level-devil-screen-size';

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FLOOR_Y = 486;
const MAX_LEVEL = 100;
const STORAGE_KEY = 'level-devil-save-v3';
const GRAVITY = 1550;
const JUMP_SPEED = 610;
const MAX_SPEED = 285;
const ACCELERATION = 1750;
const LEVEL_ADVANCE_DELAY = 2.5;

const chapters = [
  { name: 'Warm-up', range: '01–20', hue: '#8bf2c0' },
  { name: 'Tricky', range: '21–40', hue: '#ffd274' },
  { name: 'No mercy', range: '41–60', hue: '#ff9b72' },
  { name: 'Mind games', range: '61–80', hue: '#c89dff' },
  { name: 'Devil mode', range: '81–100', hue: '#ff6d91' },
];

const input = { left: false, right: false, jumpQueued: false };
const savedProgress = loadProgress();
let totalCoins = savedProgress.totalCoins;
const collectedCoinIds = new Set(savedProgress.collectedCoinIds);
const player = {
  x: 0,
  y: 0,
  w: 24,
  h: 40,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  walkTime: 0,
  safeTime: 0,
};

let currentLevel = 1;
let highestUnlocked = savedProgress.highestUnlocked;
let map;
let cameraX = 0;
let paused = false;
let won = false;
let levelAdvanceAt = 0;
let enteringDoor = false;
let playerHidden = false;
let aiPilot = false;
let aiRetriesThisLevel = 0;
let aiServerJump = false;
let aiRequestCountdown = 0;
let aiRequestGeneration = 0;
let aiRequestInFlight = false;
let aiServerAvailable = false;
let aiServerErrorShown = false;
let aiServerDisabled = false;
let audioContext = null;
let musicTimer = 0;
let musicEnabled = false;
let musicNotes = [];
let musicStep = 0;
let levelCoins = 0;
let levelStartedAt = 0;
let deaths = 0;
let statusTimer = 0;
let elapsed = 0;
let lastFrame = 0;

function loadProgress() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const saved = JSON.parse(stored);
      return {
        highestUnlocked: Number.isInteger(saved.highestUnlocked)
          ? Math.max(1, Math.min(MAX_LEVEL, saved.highestUnlocked))
          : 1,
        totalCoins: Number.isInteger(saved.totalCoins) ? Math.max(0, saved.totalCoins) : 0,
        collectedCoinIds: Array.isArray(saved.collectedCoinIds)
          ? saved.collectedCoinIds.filter((id) => typeof id === 'string')
          : [],
      };
    }
    const oldSaved = Number(localStorage.getItem('level-devil-progress-v2'));
    return {
      highestUnlocked: Number.isInteger(oldSaved) ? Math.max(1, Math.min(MAX_LEVEL, oldSaved)) : 1,
      totalCoins: 0,
      collectedCoinIds: [],
    };
  } catch (error) {
    console.warn('Could not read saved GT progress.', error);
    return { highestUnlocked: 1, totalCoins: 0, collectedCoinIds: [] };
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      highestUnlocked,
      totalCoins,
      collectedCoinIds: [...collectedCoinIds],
    }));
  } catch (error) {
    console.warn('Could not save GT progress.', error);
    setStatus('Progress could not be saved in this browser.', 3);
  }
}

function randomForLevel(level) {
  let seed = (level * 9301 + 49297) % 233280;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function makeCoins(level, platforms, spikes) {
  const safePlatforms = platforms
    .filter((platform) => platform.kind !== 'ground' && platform.w >= 90)
    .filter((platform) => platform.x > 200 && platform.x < 1580);
  if (safePlatforms.length === 0) return [];

  const count = Math.min(6, 2 + Math.floor(level / 18));
  const coins = [];
  for (let i = 0; i < count; i += 1) {
    const targetIndex = Math.floor(((i + 0.5) * safePlatforms.length) / count);
    const platform = safePlatforms[Math.min(safePlatforms.length - 1, targetIndex)];
    const candidates = [
      platform.x + platform.w / 2,
      platform.x + platform.w * 0.34,
      platform.x + platform.w * 0.66,
    ];
    const x = candidates.find((candidate) => !spikes.some((spike) =>
      spike.y === platform.y - 12
      && candidate + 10 > spike.x
      && candidate - 10 < spike.x + spike.w
    )) ?? candidates[0];
    coins.push({
      id: `${level}-${i}`,
      x,
      y: platform.y - 22,
      phase: i * 1.8 + level,
      collected: false,
    });
  }
  return coins;
}

function createLevel(level) {
  const random = randomForLevel(level);
  const difficulty = (level - 1) / 99;
  const worldWidth = 1830;
  const platforms = [];
  const spikes = [];
  const saws = [];
  const gaps = [];

  const pathHeights = [0, -34, 2, -48, -7, -58, -22, -70, -30, -52, -15];
  platforms.push({ x: 0, y: FLOOR_Y, w: 245, h: 54, kind: 'ground' });

  for (let i = 0; i < 11; i += 1) {
    const x = 238 + i * 130;
    const variation = Math.round((random() - 0.5) * (8 + difficulty * 18));
    const y = 430 + pathHeights[i] + variation;
    const width = Math.max(94, 126 - Math.floor(difficulty * 19) + (i % 3 === 0 ? 8 : 0));
    const crumble = level >= 61 && ((i + level) % Math.max(2, 7 - Math.floor((level - 61) / 10)) === 0);
    const holeWidth = level >= 41 && random() < difficulty * 0.32
      ? Math.min(25, 14 + Math.floor(difficulty * 12))
      : 0;
    const holeX = x + Math.floor(width / 2 - holeWidth / 2);
    const addPlatform = (platformX, platformWidth) => {
      if (platformWidth < 1) return;
      platforms.push({
        x: platformX,
        y,
        w: platformWidth,
        h: 18,
        kind: crumble ? 'crumble' : 'ledge',
        state: 'solid',
        crumbleTimer: 0,
        resetTimer: 0,
      });
    };
    if (holeWidth > 0) {
      addPlatform(x, holeX - x);
      addPlatform(holeX + holeWidth, x + width - holeX - holeWidth);
      gaps.push({ x: holeX, y, w: holeWidth, h: 18, platform: x });
    } else {
      addPlatform(x, width);
    }

    const spikeChance = level < 3 ? 0 : Math.min(0.68, 0.1 + difficulty * 0.5);
    if (random() < spikeChance) {
      const spikeWidth = 26 + Math.floor(random() * 14);
      const offset = 17 + Math.floor(random() * Math.max(18, width - spikeWidth - 34));
      const spikeX = x + offset;
      const overlapsHole = holeWidth > 0 && spikeX < holeX + holeWidth && spikeX + spikeWidth > holeX;
      if (!overlapsHole) spikes.push({ x: spikeX, y: y - 12, w: spikeWidth, h: 12 });
    }

  }

  platforms.push({ x: 1585, y: FLOOR_Y, w: 245, h: 54, kind: 'ground' });

  if (level >= 8) {
    const count = Math.min(5, 1 + Math.floor((level - 8) / 19));
    for (let i = 0; i < count; i += 1) {
      const lane = 1 + Math.floor(random() * 9);
      const platform = platforms[lane];
      const y = platform.y - 24 - random() * (level >= 41 ? 55 : 24);
      saws.push({
        x: platform.x + platform.w * (0.3 + random() * 0.4),
        y,
        baseY: y,
        r: 13 + Math.floor(difficulty * 3),
        minX: Math.max(210, platform.x - (20 + difficulty * 28)),
        maxX: Math.min(1630, platform.x + platform.w + 26 + difficulty * 35),
        speed: 55 + difficulty * 92 + random() * 25,
        direction: random() < 0.5 ? -1 : 1,
        phase: random() * Math.PI * 2,
      });
    }
  }

  const floorSpikeCount = level < 5 ? 0 : Math.min(6, Math.floor((level - 3) / 17));
  for (let i = 0; i < floorSpikeCount; i += 1) {
    const x = 315 + i * 226 + random() * 56;
    spikes.push({ x, y: FLOOR_Y - 12, w: 35 + Math.floor(random() * 15), h: 12 });
  }

  if (level >= 21) {
    const gapCount = Math.min(5, 1 + Math.floor((level - 21) / 17));
    for (let i = 0; i < gapCount; i += 1) {
      const x = 370 + i * 245 + random() * 32;
      const gapWidth = 38 + Math.min(38, Math.floor((level - 21) / 2));
      platforms.push({ x: x + gapWidth, y: FLOOR_Y, w: 150, h: 54, kind: 'ground' });
      gaps.push({ x, y: FLOOR_Y, w: gapWidth, h: 54, platform: x });
      if (level >= 41) {
        spikes.push({ x: x + 4, y: FLOOR_Y - 12, w: gapWidth - 8, h: 12 });
      }
    }
  }

  return {
    level,
    difficulty,
    worldWidth,
    platforms,
    spikes,
    saws,
    gaps,
    exit: { x: 1734, y: FLOOR_Y - 78, w: 42, h: 78 },
    fakeExit: level >= 31 ? { x: 1120, y: FLOOR_Y - 68, w: 34, h: 68 } : null,
    coins: makeCoins(level, platforms, spikes),
  };
}

function setStatus(message, duration = 2.5) {
  statusEl.textContent = message;
  stageMessage.classList.remove('is-hidden');
  statusTimer = duration;
}

function unlockAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    audioContext ??= new AudioContextConstructor();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => console.warn('Could not unlock game audio.', error));
    }
  } catch (error) {
    console.warn('Could not initialize game audio.', error);
  }
}

function playTone(frequency, { duration = 0.18, volume = 0.025, type = 'triangle', delay = 0 } = {}) {
  if (!audioContext || audioContext.state !== 'running') return;

  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSoundEffect(effect) {
  if (effect === 'coin') {
    playTone(880, { duration: 0.12, volume: 0.045, type: 'sine' });
    playTone(1320, { duration: 0.2, volume: 0.035, type: 'sine', delay: 0.07 });
  } else if (effect === 'jump') {
    playTone(330, { duration: 0.11, volume: 0.025, type: 'triangle' });
    playTone(495, { duration: 0.09, volume: 0.015, type: 'sine', delay: 0.04 });
  } else if (effect === 'trap') {
    playTone(180, { duration: 0.19, volume: 0.04, type: 'triangle' });
    playTone(120, { duration: 0.26, volume: 0.03, type: 'sawtooth', delay: 0.08 });
  } else if (effect === 'clear') {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      playTone(frequency, { duration: 0.42, volume: 0.025, type: 'sine', delay: index * 0.11 });
    });
  }
}

function updateMusicButton() {
  const label = musicEnabled ? 'Stop level music' : 'Start level music';
  musicButton.setAttribute('aria-label', label);
  musicButton.setAttribute('aria-pressed', String(musicEnabled));
  musicButton.title = label;
  musicButton.classList.toggle('is-active', musicEnabled);
}

function scheduleLevelMusic() {
  if (!musicEnabled || !audioContext || audioContext.state !== 'running') return;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const beat = musicStep % musicNotes.length;
  const note = scale[musicNotes[beat]];
  const root = 174.61 * (2 ** ((currentLevel % 12) / 12));
  playTone(root * (2 ** (note / 12)), { duration: 0.24, volume: 0.022, type: 'triangle' });
  playTone(root * (2 ** ((note + 12) / 12)), { duration: 0.1, volume: 0.009, type: 'sine', delay: 0.025 });
  if (beat % 4 === 0) {
    playTone(root / 2, { duration: 1.1, volume: 0.014, type: 'sine' });
    playTone(root * (2 ** (scale[musicNotes[(beat + 2) % musicNotes.length]] / 12)), {
      duration: 0.9,
      volume: 0.01,
      type: 'sine',
      delay: 0.04,
    });
  }
  musicStep += 1;
  musicTimer = window.setTimeout(scheduleLevelMusic, 360 + (currentLevel % 5) * 20);
}

function selectLevelMusic() {
  if (musicTimer) window.clearTimeout(musicTimer);
  if (!musicEnabled) return;
  const random = randomForLevel(currentLevel + 137);
  const motif = Array.from({ length: 4 }, () => Math.floor(random() * 8));
  musicNotes = [...motif, ...motif.slice().reverse()];
  musicStep = 0;
  scheduleLevelMusic();
}

async function toggleLevelMusic() {
  if (musicEnabled) {
    musicEnabled = false;
    if (musicTimer) window.clearTimeout(musicTimer);
    updateMusicButton();
    return;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    setStatus('This browser does not support background music.', 3);
    return;
  }
  try {
    audioContext ??= new AudioContextConstructor();
    await audioContext.resume();
    musicEnabled = true;
    updateMusicButton();
    selectLevelMusic();
  } catch (error) {
    console.error('Could not start level music.', error);
    setStatus('Could not start music. Check your browser audio settings.', 3);
  }
}

async function rotateForPhone() {
  try {
    if (!document.fullscreenElement && stageWrap.requestFullscreen) {
      await stageWrap.requestFullscreen();
    }
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape');
      setStatus('Landscape mode enabled.', 2);
      return;
    }
    setStatus('Please rotate your phone sideways for landscape play.', 3);
  } catch (error) {
    console.info('Phone orientation lock is unavailable.', error);
    setStatus('Please allow fullscreen, then rotate your phone sideways.', 3);
  }
}

function setScreenSize(size, persist = true) {
  const normalized = Math.max(70, Math.min(150, Math.round(Number(size) / 10) * 10));
  document.documentElement.style.setProperty('--game-screen-size', `${normalized}%`);
  stageWrap.classList.toggle('is-large-screen', normalized > 100);
  screenSizeInput.value = String(normalized);
  screenSizeLabel.value = `${normalized}%`;
  if (persist) {
    try {
      localStorage.setItem(SCREEN_SIZE_KEY, String(normalized));
    } catch (error) {
      console.warn('Could not save the game screen size preference.', error);
    }
  }
}

function restoreScreenSize() {
  try {
    const saved = Number(localStorage.getItem(SCREEN_SIZE_KEY));
    setScreenSize(Number.isFinite(saved) && saved >= 70 && saved <= 150 ? saved : 100, false);
  } catch (error) {
    console.warn('Could not restore the game screen size preference.', error);
    setScreenSize(100, false);
  }
}

async function toggleFullscreen() {
  if (stageWrap.classList.contains('is-fullscreen')) {
    stageWrap.classList.remove('is-fullscreen');
    document.body.classList.remove('game-fullscreen-fallback');
    updateFullscreenButton();
    return;
  }

  try {
    if (document.fullscreenElement === stageWrap) await document.exitFullscreen();
    else if (!document.fullscreenElement && stageWrap.requestFullscreen) await stageWrap.requestFullscreen();
    else throw new Error('Fullscreen API is unavailable.');
  } catch (error) {
    if (error.name === 'NotSupportedError' || error.name === 'TypeError' ||
        error.message === 'Fullscreen API is unavailable.') {
      stageWrap.classList.add('is-fullscreen');
      document.body.classList.add('game-fullscreen-fallback');
      updateFullscreenButton();
      return;
    }
    console.error('Could not change the game screen fullscreen mode.', error);
    setStatus('Could not change fullscreen mode. Try again.', 3);
  }
}

function updateFullscreenButton() {
  const isFullscreen = document.fullscreenElement === stageWrap || stageWrap.classList.contains('is-fullscreen');
  fullscreenButton.textContent = isFullscreen ? '↙' : '⛶';
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.title = label;
  stageFullscreenButton.setAttribute('aria-label', label);
  stageFullscreenButton.title = label;
  stageFullscreenButton.textContent = isFullscreen ? '↙' : '⛶';
}

function updateProgressUI() {
  const chapterIndex = Math.min(4, Math.floor((currentLevel - 1) / 20));
  const chapter = chapters[chapterIndex];
  document.querySelector('#progressText').innerHTML = `${highestUnlocked} <span>/ 100</span>`;
  document.querySelector('#unlockedProgress').style.width = `${highestUnlocked}%`;
  document.querySelector('#chapterName').textContent = chapter.name;
  document.querySelector('#chapterRange').textContent = chapter.range;
  document.querySelector('#chapterName').style.color = chapter.hue;
  document.querySelector('#coinCount').textContent = String(totalCoins);
  document.querySelector('#levelSelectLink').href = `level-select.html?level=${currentLevel}`;
  document.querySelector('#stageLevelSelectLink').href = `level-select.html?level=${currentLevel}`;
  updateAIPilotButton();
  levelTitle.innerHTML = `LEVEL ${String(currentLevel).padStart(2, '0')} <span>/ 100</span>`;
  levelProgress.style.width = `${(currentLevel / MAX_LEVEL) * 100}%`;

}

function startLevel(level) {
  currentLevel = Math.max(1, Math.min(highestUnlocked, level));
  aiRetriesThisLevel = 0;
  aiRequestGeneration += 1;
  aiRequestInFlight = false;
  aiRequestCountdown = 0;
  aiServerJump = false;
  map = createLevel(currentLevel);
  levelCoins = 0;
  levelStartedAt = performance.now();
  for (const coin of map.coins) {
    coin.collected = collectedCoinIds.has(coin.id);
  }
  player.x = 58;
  player.y = FLOOR_Y - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.safeTime = 0.75;
  player.walkTime = 0;
  cameraX = 0;
  paused = false;
  won = false;
  levelAdvanceAt = 0;
  enteringDoor = false;
  playerHidden = false;
  document.querySelector('#leaderboardPanel').hidden = true;
  input.left = false;
  input.right = false;
  input.jumpQueued = false;
  document.querySelector('#pauseButton').textContent = 'Ⅱ';
  document.querySelector('#pauseButton').setAttribute('aria-label', 'Pause game');
  statusTimer = 0;
  stageMessage.classList.add('is-hidden');
  updateProgressUI();
  selectLevelMusic();
}

function collectCoin(coin) {
  if (coin.collected) return;
  coin.collected = true;
  collectedCoinIds.add(coin.id);
  totalCoins += 1;
  levelCoins += 1;
  saveProgress();
  document.querySelector('#coinCount').textContent = String(totalCoins);
  playSoundEffect('coin');
  if (aiPilot && map.coins.every((levelCoin) => levelCoin.collected)) {
    setStatus('AI collected every coin on this level!', 2.4);
  } else {
    setStatus(`Coin collected! ${totalCoins} in your stash.`, 1.4);
  }
}

function intersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hitSaw(saw, rect) {
  const closestX = Math.max(rect.x, Math.min(saw.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(saw.y, rect.y + rect.h));
  const dx = saw.x - closestX;
  const dy = saw.y - closestY;
  return dx * dx + dy * dy < saw.r * saw.r;
}

function die(message = 'Trap! Shake it off and go again.') {
  if (player.safeTime > 0 || won) return;
  if (aiPilot && aiRetriesThisLevel > 0) {
    rescueAIPilot();
    return;
  }
  deaths += 1;
  if (aiPilot) aiRetriesThisLevel += 1;
  playSoundEffect('trap');
  player.x = 58;
  player.y = FLOOR_Y - player.h;
  player.vx = 0;
  player.vy = 0;
  player.safeTime = 1.1;
  cameraX = 0;
  for (const platform of map.platforms) {
    if (platform.kind === 'crumble') {
      platform.state = 'solid';
      platform.crumbleTimer = 0;
      platform.resetTimer = 0;
    }
  }
  if (aiPilot) {
    setStatus(`AI recovering from trap ${deaths}; retrying level ${currentLevel} automatically.`, 2.4);
  } else {
    setStatus(deaths % 3 === 0 ? 'The devil got you again. Breathe. Try again.' : message, 2);
  }
}

function rescueAIPilot() {
  const nextPlatform = map.platforms
    .filter((platform) =>
      platform.kind !== 'ground'
      && platform.state !== 'gone'
      && platform.w >= player.w + 8
      && platform.x > player.x + player.w / 2
    )
    .sort((a, b) => a.x - b.x)[0];
  const finalPlatform = map.platforms
    .filter((platform) => platform.kind === 'ground' && platform.x > player.x)
    .sort((a, b) => a.x - b.x)[0];
  const landing = nextPlatform ?? finalPlatform;

  if (landing) {
    player.x = landing.kind === 'ground'
      ? landing.x + 8
      : landing.x + Math.min(8, landing.w - player.w);
    player.y = landing.y - player.h;
    if (landing.kind === 'crumble') {
      landing.state = 'solid';
      landing.crumbleTimer = 0;
      landing.resetTimer = 0;
    }
  } else {
    player.x = map.exit.x - player.w - 4;
    player.y = map.exit.y;
  }

  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.safeTime = Number.POSITIVE_INFINITY;
  cameraX = Math.max(0, Math.min(map.worldWidth - WIDTH, player.x - WIDTH * 0.42));
  setStatus('AI safety net engaged. It will finish this level without another retry.', 2.4);
}

function completeLevel() {
  if (won || enteringDoor) return;
  enteringDoor = true;
  player.vx = 0;
  input.left = false;
  input.right = false;
  input.jumpQueued = false;
  setStatus('Heading through the exit...', 999);
}

function finishLevel() {
  if (won) return;
  enteringDoor = false;
  playerHidden = true;
  won = true;
  playSoundEffect('clear');
  highestUnlocked = Math.max(highestUnlocked, Math.min(MAX_LEVEL, currentLevel + 1));
  saveProgress();
  updateProgressUI();
  window.dispatchEvent(new CustomEvent('leveldevil:levelcompleted', {
    detail: {
      level: currentLevel,
      score: levelCoins,
      durationMs: Math.max(1, Math.round(performance.now() - levelStartedAt)),
    },
  }));
  if (currentLevel < MAX_LEVEL) {
    levelAdvanceAt = performance.now() + LEVEL_ADVANCE_DELAY * 1000;
  }
  setStatus(currentLevel === MAX_LEVEL ? 'You beat all 100 levels. GT is yours!' : 'Exit found! Get ready for the next level.', 999);
}

function movePlayer(dt) {
  if (enteringDoor) {
    player.vx = 145;
    player.facing = 1;
    player.x += player.vx * dt;
    player.walkTime += dt * player.vx / 38;
    if (player.x >= map.exit.x + map.exit.w + 2) finishLevel();
    return;
  }

  const direction = Number(input.right) - Number(input.left);
  if (direction) {
    player.vx += direction * ACCELERATION * dt;
    player.facing = direction;
  } else {
    player.vx *= Math.pow(0.82, dt * 60);
    if (Math.abs(player.vx) < 6) player.vx = 0;
  }
  player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

  if (input.jumpQueued && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
    playSoundEffect('jump');
  }
  input.jumpQueued = false;

  player.vy = Math.min(player.vy + GRAVITY * dt, 920);
  player.x += player.vx * dt;
  player.x = Math.max(0, Math.min(map.worldWidth - player.w, player.x));

  for (const platform of map.platforms) {
    if (platform.state === 'gone') continue;
    const body = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (intersect(body, platform)) {
      if (player.vx > 0) player.x = platform.x - player.w;
      else if (player.vx < 0) player.x = platform.x + platform.w;
      player.vx = 0;
    }
  }

  const previousBottom = player.y + player.h;
  player.y += player.vy * dt;
  player.onGround = false;
  for (const platform of map.platforms) {
    if (platform.state === 'gone' || player.vy < 0) continue;
    const overlapsX = player.x + player.w > platform.x && player.x < platform.x + platform.w;
    const currentBottom = player.y + player.h;
    if (overlapsX && previousBottom <= platform.y + 3 && currentBottom >= platform.y) {
      player.y = platform.y - player.h;
      player.vy = 0;
      player.onGround = true;
      if (platform.kind === 'crumble' && platform.state === 'solid') {
        platform.state = 'shaking';
        platform.crumbleTimer = 0.52;
      }
    }
  }

  if (player.y > HEIGHT + 120) {
    if (aiPilot && aiRetriesThisLevel > 0) rescueAIPilot();
    else die();
    return;
  }

  const body = { x: player.x + 3, y: player.y + 2, w: player.w - 6, h: player.h - 4 };
  if (player.safeTime <= 0) {
    if (map.spikes.some((spike) => intersect(body, spike))) {
      die();
      return;
    }
    if (map.saws.some((saw) => hitSaw(saw, body))) {
      die();
      return;
    }
  }

  if (player.safeTime <= 0 && map.fakeExit && intersect(body, map.fakeExit)) {
    die('Fake exit! That one was a trick.');
    return;
  }

  if (intersect(body, map.exit)) {
    completeLevel();
    return;
  }

  for (const coin of map.coins) {
    if (!coin.collected && intersect(body, { x: coin.x - 10, y: coin.y - 10, w: 20, h: 20 })) {
      collectCoin(coin);
    }
  }

  if (player.onGround && direction) player.walkTime += dt * Math.abs(player.vx) / 38;
  if (player.safeTime > 0) player.safeTime -= dt;
}

function updateAIPilotButton() {
  for (const button of document.querySelectorAll('[data-ai-toggle]')) {
    button.classList.toggle('is-active', aiPilot);
    button.setAttribute('aria-pressed', String(aiPilot));
    button.setAttribute('aria-label', aiPilot ? 'Stop AI pilot' : 'Start AI pilot');
  }
}

function toggleAIPilot() {
  if (won || enteringDoor) return;
  aiPilot = !aiPilot;
  if (!aiPilot && aiRetriesThisLevel > 0) player.safeTime = Math.min(player.safeTime, 0.75);
  aiServerJump = false;
  aiRequestCountdown = 0;
  input.left = false;
  input.right = false;
  input.jumpQueued = false;
  updateAIPilotButton();
  setStatus(aiPilot ? 'AI pilot engaged. Let’s find a safe way through.' : 'AI pilot off. You’re back in control.', 3);
}

function nearestPlatformAhead() {
  return map.platforms
    .filter((platform) => platform.state !== 'gone' && platform.x > player.x)
    .sort((a, b) => a.x - b.x)[0];
}

function aiNeedsToJump() {
  const playerRight = player.x + player.w;
  const feet = player.y + player.h;
  const lookAhead = 92 + Math.min(22, Math.abs(player.vx) * 0.08)
    + Math.min(80, aiRetriesThisLevel * 3);
  const closeAhead = (hazard) => hazard.x + hazard.w > playerRight + 2
    && hazard.x < playerRight + lookAhead;

  if (map.spikes.some((spike) =>
    closeAhead(spike)
    && spike.y < feet + 47
    && spike.y + spike.h > player.y - 30
  )) return true;

  if (map.gaps.some((gap) =>
    closeAhead(gap)
    && gap.y >= feet - 46
    && gap.y <= feet + 20
  )) return true;

  if (map.saws.some((saw) =>
    saw.x + saw.r > playerRight + 2
    && saw.x - saw.r < playerRight + lookAhead
    && Math.abs(saw.y - (player.y + player.h / 2)) < 68
  )) return true;

  if (map.fakeExit && closeAhead(map.fakeExit)) return true;

  const nextPlatform = nearestPlatformAhead();
  if (nextPlatform) {
    const distance = nextPlatform.x - playerRight;
    const platformIsHigher = nextPlatform.y < feet - 8;
    if (platformIsHigher && distance < lookAhead && distance > -16) return true;
  }

  return false;
}

function requestPythonAIDecision() {
  if (aiRequestInFlight || !aiPilot) return;
  const generation = aiRequestGeneration;
  const nearbyHazards = [];
  for (const spike of map.spikes) {
    if (spike.x + spike.w >= player.x - 16 && spike.x <= player.x + 300) {
      nearbyHazards.push({ kind: 'spike', x: spike.x, y: spike.y, w: spike.w, h: spike.h });
    }
  }
  for (const gap of map.gaps) {
    if (gap.x + gap.w >= player.x - 16 && gap.x <= player.x + 300) {
      nearbyHazards.push({ kind: 'gap', x: gap.x, y: gap.y, w: gap.w, h: gap.h });
    }
  }
  for (const saw of map.saws) {
    if (saw.x + saw.r >= player.x - 16 && saw.x - saw.r <= player.x + 300) {
      nearbyHazards.push({
        kind: 'saw',
        x: saw.x - saw.r,
        y: saw.y - saw.r,
        w: saw.r * 2,
        h: saw.r * 2,
      });
    }
  }
  if (map.fakeExit && map.fakeExit.x + map.fakeExit.w >= player.x - 16 && map.fakeExit.x <= player.x + 300) {
    nearbyHazards.push({ kind: 'fake_exit', ...map.fakeExit });
  }

  const platform = nearestPlatformAhead();
  const body = {
    player: {
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h,
      vx: player.vx,
      vy: player.vy,
    },
    hazards: nearbyHazards,
    next_platform: platform ? { x: platform.x, y: platform.y } : null,
  };

  aiRequestInFlight = true;
  fetch('/api/agent/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Python agent returned HTTP ${response.status}.`);
      return response.json();
    })
    .then((decision) => {
      if (generation !== aiRequestGeneration || !aiPilot) return;
      aiServerAvailable = true;
      aiServerJump = decision.jump === true;
    })
    .catch((error) => {
      if (generation !== aiRequestGeneration) return;
      aiServerAvailable = false;
      aiServerJump = false;
      aiServerDisabled = true;
      if (!aiServerErrorShown) {
        console.info('Python AI server unavailable; using the built-in pilot.', error);
        aiServerErrorShown = true;
      }
    })
    .finally(() => {
      if (generation === aiRequestGeneration) aiRequestInFlight = false;
    });
}

function updateAIPilot(dt) {
  if (!aiPilot || won || enteringDoor || paused) return;

  input.left = false;
  input.right = true;
  if (player.x > map.exit.x + map.exit.w) {
    player.x = map.exit.x - player.w - 4;
    player.y = map.exit.y + map.exit.h - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.safeTime = Math.max(player.safeTime, 0.2);
    completeLevel();
    return;
  }
  for (const coin of map.coins) {
    if (!coin.collected && coin.x <= player.x + 120) collectCoin(coin);
  }
  aiRequestCountdown -= dt;
  if (aiRequestCountdown <= 0 && !aiServerDisabled) {
    aiRequestCountdown = 0.18;
    requestPythonAIDecision();
  }
  if (player.onGround && (aiNeedsToJump() || aiServerJump)) input.jumpQueued = true;
  else if (!player.onGround) input.jumpQueued = false;

  if (statusTimer <= 0) {
    statusEl.textContent = aiServerAvailable
      ? 'Python AI pilot is planning the next move…'
      : 'AI pilot is navigating the traps…';
    stageMessage.classList.remove('is-hidden');
  }
}

function updateWorld(dt) {
  elapsed += dt;
  for (const saw of map.saws) {
    saw.x += saw.speed * saw.direction * dt;
    if (saw.x < saw.minX || saw.x > saw.maxX) {
      saw.direction *= -1;
      saw.x = Math.max(saw.minX, Math.min(saw.maxX, saw.x));
    }
    saw.y = saw.baseY + Math.sin(elapsed * 2 + saw.phase) * (map.level >= 41 ? 12 : 5);
  }

  for (const platform of map.platforms) {
    if (platform.kind !== 'crumble') continue;
    if (platform.state === 'shaking') {
      platform.crumbleTimer -= dt;
      if (platform.crumbleTimer <= 0) {
        platform.state = 'gone';
        platform.resetTimer = 1.8;
      }
    } else if (platform.state === 'gone') {
      platform.resetTimer -= dt;
      if (platform.resetTimer <= 0) platform.state = 'solid';
    }
  }

  updateAIPilot(dt);
  movePlayer(dt);
  const targetX = Math.max(0, Math.min(map.worldWidth - WIDTH, player.x - WIDTH * 0.42));
  cameraX += (targetX - cameraX) * Math.min(1, dt * 5);

  if (statusTimer > 0) {
    statusTimer -= dt;
    if (statusTimer <= 0 && !won) {
      stageMessage.classList.add('is-hidden');
    }
  }
}

function drawBackground() {
  const biomeIndex = Math.floor((currentLevel - 1) / 20);
  const levelVariation = (currentLevel - 1) % 20;
  const levelHue = ((currentLevel - 1) * 137.508) % 360;
  const floraHue = [126, 93, 157, 121, 109][biomeIndex]
    + levelVariation * 3.6
    + (currentLevel * 29) % 53;
  const skyTop = `hsl(${levelHue}, 48%, 78%)`;
  const skyMiddle = `hsl(${levelHue + 16}, 47%, 86%)`;
  const skyLow = `hsl(${levelHue + 35}, 43%, 76%)`;
  const skyGround = `hsl(${levelHue + 74}, 30%, 53%)`;
  const farHill = `hsl(${floraHue + 23}, 25%, 65%)`;
  const nearHill = `hsl(${floraHue + 38}, 26%, 49%)`;
  const treeColor = `hsl(${floraHue + 50}, 29%, 40%)`;
  const meadowTop = `hsl(${floraHue + 15}, 32%, 57%)`;
  const meadowBottom = `hsl(${floraHue + 34}, 35%, 39%)`;
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, skyTop);
  gradient.addColorStop(0.48, skyMiddle);
  gradient.addColorStop(0.76, skyLow);
  gradient.addColorStop(1, skyGround);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sunX = WIDTH * (0.66 + (currentLevel % 7) * 0.035) - cameraX * 0.035;
  const sunGlow = ctx.createRadialGradient(sunX, 105, 8, sunX, 105, 95);
  sunGlow.addColorStop(0, 'rgba(255, 247, 190, 0.7)');
  sunGlow.addColorStop(1, 'rgba(255, 240, 176, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunX - 96, 9, 192, 192);
  ctx.fillStyle = `hsl(${levelHue + 38}, 91%, 84%)`;
  ctx.beginPath();
  ctx.arc(sunX, 105, 31, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 3 + (currentLevel % 4); i += 1) {
    const cloudX = ((i * (180 + (currentLevel % 5) * 17) - cameraX * 0.1) % (WIDTH + 180) + WIDTH + 180) % (WIDTH + 180) - 50;
    const cloudY = 69 + (i * 43) % 86;
    ctx.fillStyle = 'rgba(250, 255, 231, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cloudX, cloudY, 37, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(cloudX - 15, cloudY - 6, 16, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(cloudX + 4, cloudY - 10, 21, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cloudX + 22, cloudY - 4, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = farHill;
  ctx.beginPath();
  ctx.moveTo(0, 303);
  for (let x = 0; x <= WIDTH + 32; x += 32) {
    const y = 249 + Math.sin((x + cameraX * 0.09) * 0.009) * 31
      + Math.sin((x + cameraX * 0.09) * 0.019) * 13;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(WIDTH, FLOOR_Y);
  ctx.lineTo(0, FLOOR_Y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = nearHill;
  ctx.beginPath();
  ctx.moveTo(0, 356);
  for (let x = 0; x <= WIDTH + 38; x += 38) {
    const y = 300 + Math.sin((x + cameraX * 0.17 + 90) * 0.008) * 27
      + Math.sin((x + cameraX * 0.17) * 0.016) * 11;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(WIDTH, FLOOR_Y);
  ctx.lineTo(0, FLOOR_Y);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 14 + (currentLevel % 8); i += 1) {
    const x = ((i * (67 + currentLevel % 23) - cameraX * 0.3) % (WIDTH + 120) + WIDTH + 120) % (WIDTH + 120) - 35;
    const baseY = 327 + (i * 31) % 92;
    const crown = 22 + (i * 17) % 18;
    ctx.fillStyle = treeColor;
    ctx.fillRect(x - 3, baseY - crown, 6, crown);
    ctx.beginPath();
    ctx.arc(x, baseY - crown - 8, 12, 0, Math.PI * 2);
    ctx.arc(x - 9, baseY - crown, 10, 0, Math.PI * 2);
    ctx.arc(x + 9, baseY - crown + 1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(195, 218, 151, 0.48)';
    ctx.beginPath();
    ctx.arc(x - 4, baseY - crown - 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const meadow = ctx.createLinearGradient(0, 417, 0, HEIGHT);
  meadow.addColorStop(0, meadowTop);
  meadow.addColorStop(1, meadowBottom);
  ctx.fillStyle = meadow;
  ctx.fillRect(0, 417, WIDTH, HEIGHT - 417);
  ctx.fillStyle = 'rgba(231, 230, 164, 0.3)';
  ctx.fillRect(0, 417, WIDTH, 3);

  for (let i = 0; i < 70; i += 1) {
    const x = ((i * 47 - cameraX * 0.42) % (WIDTH + 40) + WIDTH + 40) % (WIDTH + 40);
    const y = 430 + (i * 23) % 86;
    const sway = Math.sin(elapsed * 1.6 + i * 2.1) * 2;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(225, 239, 169, 0.75)' : 'rgba(52, 108, 72, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.quadraticCurveTo(x + sway, y + 2, x + sway * 1.6, y - 3);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.fillStyle = i % 2 === 0 ? '#f9e69a' : '#fff3dc';
      ctx.beginPath();
      ctx.arc(x + sway * 1.6, y - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlatform(platform) {
  if (platform.state === 'gone') return;
  let offset = 0;
  if (platform.state === 'shaking') offset = Math.sin(elapsed * 55) * 2;
  const y = platform.y + offset;
  ctx.fillStyle = platform.kind === 'crumble' ? '#b98bca' : '#a69ab9';
  ctx.fillRect(platform.x, y, platform.w, platform.h);
  ctx.fillStyle = platform.kind === 'crumble' ? '#e3b9eb' : '#ded2e7';
  ctx.fillRect(platform.x, y, platform.w, 4);
  ctx.fillStyle = 'rgba(46, 36, 61, 0.5)';
  for (let x = platform.x + 13; x < platform.x + platform.w - 5; x += 29) {
    ctx.fillRect(x, y + 8, 10, 3);
  }
}

function drawSpikes(spike) {
  const count = Math.max(2, Math.floor(spike.w / 10));
  ctx.fillStyle = '#ff6d91';
  for (let i = 0; i < count; i += 1) {
    const x = spike.x + (i * spike.w) / count;
    const width = spike.w / count;
    ctx.beginPath();
    ctx.moveTo(x, spike.y + spike.h);
    ctx.lineTo(x + width / 2, spike.y);
    ctx.lineTo(x + width, spike.y + spike.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 109, 145, 0.22)';
  ctx.fillRect(spike.x, spike.y + spike.h - 2, spike.w, 2);
}

function drawGap(gap) {
  ctx.fillStyle = 'rgba(23, 20, 35, 0.82)';
  ctx.fillRect(gap.x, gap.y, gap.w, gap.h);
  ctx.fillStyle = 'rgba(255, 109, 145, 0.68)';
  ctx.fillRect(gap.x, gap.y, 2, Math.min(gap.h, 7));
  ctx.fillRect(gap.x + gap.w - 2, gap.y, 2, Math.min(gap.h, 7));
}

function drawSaw(saw) {
  ctx.save();
  ctx.translate(saw.x, saw.y);
  ctx.rotate(elapsed * saw.speed * 0.035);
  ctx.fillStyle = '#ffd274';
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const radius = i % 2 === 0 ? saw.r : saw.r * 0.68;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff0c7';
  ctx.beginPath();
  ctx.arc(0, 0, saw.r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExit(exit, fake = false) {
  const pulse = 0.72 + Math.sin(elapsed * 4) * 0.08;
  ctx.save();
  ctx.globalAlpha = fake ? 0.55 : 1;
  ctx.shadowColor = fake ? '#ff6d91' : '#8bf2c0';
  ctx.shadowBlur = 18 * pulse;
  ctx.fillStyle = fake ? '#bc5b77' : '#71dca9';
  ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#29253b';
  ctx.fillRect(exit.x + 7, exit.y + 7, exit.w - 14, exit.h - 7);
  ctx.fillStyle = fake ? '#ff9caf' : '#b9ffda';
  ctx.beginPath();
  ctx.arc(exit.x + exit.w - 11, exit.y + exit.h * 0.56, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundedRectPath(x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + width - corner, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + corner);
  ctx.lineTo(x + width, y + height - corner);
  ctx.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  ctx.lineTo(x + corner, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - corner);
  ctx.lineTo(x, y + corner);
  ctx.quadraticCurveTo(x, y, x + corner, y);
  ctx.closePath();
}

function drawCoin(coin) {
  if (coin.collected) return;
  const bob = Math.sin(elapsed * 3 + coin.phase) * 4;
  ctx.save();
  ctx.translate(coin.x, coin.y + bob);
  ctx.shadowColor = '#ffcf62';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcf62';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff0b2';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ad6d31';
  ctx.font = '700 10px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¢', 0, 0.5);
  ctx.restore();
}

function drawCartoonPerson() {
  const x = player.x + player.w / 2;
  const y = player.y;
  const walking = player.onGround && Math.abs(player.vx) > 20;
  const gait = walking ? Math.sin(player.walkTime * 8) : 0;
  const stride = gait * 4.5;
  const bounce = walking ? Math.abs(gait) * 1.3 : 0;
  const airborne = !player.onGround;
  const legLift = airborne && player.vy < 0 ? -3 : airborne ? 2 : 0;
  const armSwing = walking ? gait * 3.5 : airborne ? -4 : 0;

  ctx.save();
  ctx.translate(x, y + bounce);
  if (player.safeTime > 0 && Math.floor(elapsed * 14) % 2 === 0) ctx.globalAlpha = 0.48;
  ctx.scale(player.facing * 1.4, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.fillStyle = 'rgba(45, 61, 47, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 40, 11, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#49705f';
  roundedRectPath(-10, 17, 6, 13, 3);
  ctx.fill();
  ctx.fillStyle = '#8f6344';
  ctx.fillRect(-9, 20, 4, 2);

  const pantsGradient = ctx.createLinearGradient(-7, 28, 7, 40);
  pantsGradient.addColorStop(0, '#536783');
  pantsGradient.addColorStop(1, '#35495f');
  ctx.fillStyle = pantsGradient;
  ctx.beginPath();
  ctx.moveTo(-7, 27);
  ctx.quadraticCurveTo(0, 25, 7, 28);
  ctx.lineTo(6 + stride * 0.68, 36 + legLift);
  ctx.lineTo(2 + stride * 0.68, 36 + legLift);
  ctx.lineTo(-1, 32);
  ctx.lineTo(-4 - stride * 0.68, 36 - legLift * 0.25);
  ctx.lineTo(-8 - stride * 0.68, 36 - legLift * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#344458';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(-4 - stride * 0.68, 34);
  ctx.lineTo(-6 - stride * 0.68, 38 - legLift * 0.25);
  ctx.moveTo(4 + stride * 0.68, 34);
  ctx.lineTo(6 + stride * 0.68, 38 + legLift);
  ctx.stroke();

  ctx.fillStyle = '#e8d2ac';
  ctx.beginPath();
  ctx.ellipse(-7 - stride * 0.68, 38 - legLift * 0.25, 5, 2.5, -0.1, 0, Math.PI * 2);
  ctx.ellipse(7 + stride * 0.68, 38 + legLift, 5, 2.5, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#354d42';
  roundedRectPath(-7.5, 16, 15, 15, 5);
  ctx.fill();
  const jacket = ctx.createLinearGradient(-8, 16, 8, 30);
  jacket.addColorStop(0, '#82a878');
  jacket.addColorStop(1, '#587d61');
  ctx.fillStyle = jacket;
  roundedRectPath(-7, 16, 14, 13, 4);
  ctx.fill();
  ctx.fillStyle = '#d9c794';
  ctx.beginPath();
  ctx.moveTo(-2, 17);
  ctx.lineTo(0, 21);
  ctx.lineTo(2, 17);
  ctx.lineTo(1, 26);
  ctx.lineTo(-1, 26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#394e40';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(-6, 19);
  ctx.quadraticCurveTo(-9, 22 + armSwing, -8, 26 + armSwing);
  ctx.moveTo(6, 19);
  ctx.quadraticCurveTo(9, 22 - armSwing, 8, 26 - armSwing);
  ctx.stroke();
  ctx.fillStyle = '#edba82';
  ctx.beginPath();
  ctx.arc(-8, 27 + armSwing, 2.2, 0, Math.PI * 2);
  ctx.arc(8, 27 - armSwing, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#efbc83';
  roundedRectPath(-2, 13, 4, 5, 2);
  ctx.fill();

  ctx.fillStyle = '#edbd8a';
  ctx.beginPath();
  ctx.ellipse(0, 8.5, 8.5, 9.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#543d36';
  ctx.beginPath();
  ctx.moveTo(-8.3, 7);
  ctx.quadraticCurveTo(-8, -2, 0, -1.8);
  ctx.quadraticCurveTo(8, -1.6, 8.4, 6);
  ctx.lineTo(5.8, 4.8);
  ctx.lineTo(3.6, 6.4);
  ctx.lineTo(1, 4.8);
  ctx.lineTo(-2, 6.5);
  ctx.lineTo(-4.8, 5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#302f35';
  ctx.beginPath();
  ctx.arc(-3, 9, 1, 0, Math.PI * 2);
  ctx.arc(3, 9, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 129, 130, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-5, 12, 1.8, 1, 0, 0, Math.PI * 2);
  ctx.ellipse(5, 12, 1.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a35e5b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 12, 2.2, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = '#d4a66d';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 3.2, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#879c63';
  ctx.beginPath();
  ctx.ellipse(0, 1.2, 7.5, 2, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWorld() {
  drawBackground();
  ctx.save();
  ctx.translate(-cameraX, 0);

  for (const platform of map.platforms) drawPlatform(platform);
  for (const gap of map.gaps) drawGap(gap);
  for (const spike of map.spikes) drawSpikes(spike);
  for (const saw of map.saws) drawSaw(saw);
  for (const coin of map.coins) drawCoin(coin);
  if (map.fakeExit) drawExit(map.fakeExit, true);
  drawExit(map.exit);
  if (enteringDoor && !playerHidden) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.exit.x + 7, map.exit.y + 7, map.exit.w - 14, map.exit.h - 7);
    ctx.clip();
    drawCartoonPerson();
    ctx.restore();
  } else if (!playerHidden) {
    drawCartoonPerson();
  }

  ctx.restore();
}

function drawOverlay(title, subtitle, accent) {
  ctx.fillStyle = 'rgba(17, 16, 29, 0.64)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '800 39px Manrope, sans-serif';
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 16);
  ctx.fillStyle = '#e3dfea';
  ctx.font = '500 16px Manrope, sans-serif';
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 22);
}

function render() {
  drawWorld();
  if (won) {
    const nextLevelCountdown = Math.max(1, Math.ceil((levelAdvanceAt - performance.now()) / 1000));
    drawOverlay(
      currentLevel === MAX_LEVEL ? 'YOU BEAT GT' : 'LEVEL CLEARED!',
      currentLevel === MAX_LEVEL ? 'All 100 levels conquered!' : `Level ${currentLevel + 1} starts in ${nextLevelCountdown}...`,
      '#8bf2c0',
    );
  } else if (paused) {
    drawOverlay('PAUSED', 'Press P or the pause button to resume', '#ffd274');
  }
}

function tick(timestamp) {
  const dt = Math.min((timestamp - lastFrame) / 1000 || 1 / 60, 1 / 30);
  lastFrame = timestamp;
  if (won && levelAdvanceAt && timestamp >= levelAdvanceAt) {
    startLevel(currentLevel + 1);
  }
  if (!paused && !won) updateWorld(dt);
  render();
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (event) => {
  unlockAudio();
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape' && stageWrap.classList.contains('is-fullscreen')) {
    stageWrap.classList.remove('is-fullscreen');
    document.body.classList.remove('game-fullscreen-fallback');
    updateFullscreenButton();
  }
  if (event.code === 'KeyI' && !event.repeat) {
    toggleAIPilot();
    return;
  }
  if (aiPilot && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(event.code)) {
    aiPilot = false;
    updateAIPilotButton();
  }
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = true;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = true;
  if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') {
    if (!event.repeat) input.jumpQueued = true;
  }
  if (event.code === 'KeyP' && !event.repeat && !won) togglePause();
  if (event.code === 'KeyR' && !event.repeat) startLevel(currentLevel);
  if (event.code === 'KeyN' && !event.repeat && won && currentLevel < MAX_LEVEL) startLevel(currentLevel + 1);
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = false;
});

window.addEventListener('blur', () => {
  input.left = false;
  input.right = false;
});

function togglePause() {
  if (won || enteringDoor) return;
  paused = !paused;
  input.left = false;
  input.right = false;
  input.jumpQueued = false;
  const button = document.querySelector('#pauseButton');
  button.textContent = paused ? '▶' : 'Ⅱ';
  button.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  setStatus(paused ? 'Take a breather. The traps can wait.' : 'Back in the danger zone.', 1.8);
}

function bindTouchControls(control) {
  for (const button of document.querySelectorAll(`[data-control="${control}"]`)) {
    const activePointers = new Set();
    const onPointerDown = (event) => {
      unlockAudio();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      if (won || enteringDoor || paused) return;
      if (aiPilot) {
        aiPilot = false;
        aiServerJump = false;
        updateAIPilotButton();
      }
      if (control === 'jump') {
        input.jumpQueued = true;
        return;
      }
      activePointers.add(event.pointerId);
      input[control] = true;
    };

    const onPointerUp = (event) => {
      activePointers.delete(event.pointerId);
      if (control !== 'jump' && activePointers.size === 0) input[control] = false;
    };

    button.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
}

bindTouchControls('left');
bindTouchControls('right');
bindTouchControls('jump');

document.querySelector('#restartButton').addEventListener('click', () => startLevel(currentLevel));
document.querySelector('#pauseButton').addEventListener('click', togglePause);
document.querySelectorAll('[data-ai-toggle]').forEach((button) => {
  button.addEventListener('click', toggleAIPilot);
});
musicButton.addEventListener('click', toggleLevelMusic);
rotateButton.addEventListener('click', rotateForPhone);
screenSizeInput.addEventListener('input', () => setScreenSize(screenSizeInput.value));
fullscreenButton.addEventListener('click', toggleFullscreen);
stageFullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', updateFullscreenButton);
window.addEventListener('pointerdown', unlockAudio, { passive: true });

restoreScreenSize();
const requestedLevel = Number(new URLSearchParams(window.location.search).get('level'));
startLevel(Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= highestUnlocked
  ? requestedLevel
  : highestUnlocked);
requestAnimationFrame(tick);
