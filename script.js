/* ═══════════════════════════════════════════════════════════
   KARTHIKEYA VIRTUAL PIANO — script.js
   Web Audio API + QWERTY mapping + Mode toggle + Particles
═══════════════════════════════════════════════════════════ */

/* ── Audio Context ──────────────────────────────────────── */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/* ── Note frequencies (C4 → C6) ─────────────────────────── */
const NOTE_FREQ = {
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13,
  'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
  'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25,
  'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99,
  'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
  'C6': 1046.50
};

/* ── Key Layout Definition ──────────────────────────────── */
// Each entry: { note, type, qwerty }
const KEY_LAYOUT = [
  { note: 'C4', type: 'white', qwerty: 'Q' },
  { note: 'C#4', type: 'black', qwerty: 'W' },
  { note: 'D4', type: 'white', qwerty: 'E' },
  { note: 'D#4', type: 'black', qwerty: 'R' },
  { note: 'E4', type: 'white', qwerty: 'T' },
  { note: 'F4', type: 'white', qwerty: 'Y' },
  { note: 'F#4', type: 'black', qwerty: 'U' },
  { note: 'G4', type: 'white', qwerty: 'I' },
  { note: 'G#4', type: 'black', qwerty: 'O' },
  { note: 'A4', type: 'white', qwerty: 'P' },
  { note: 'A#4', type: 'black', qwerty: 'A' },
  { note: 'B4', type: 'white', qwerty: 'S' },
  { note: 'C5', type: 'white', qwerty: 'D' },
  { note: 'C#5', type: 'black', qwerty: 'F' },
  { note: 'D5', type: 'white', qwerty: 'G' },
  { note: 'D#5', type: 'black', qwerty: 'H' },
  { note: 'E5', type: 'white', qwerty: 'J' },
  { note: 'F5', type: 'white', qwerty: 'K' },
  { note: 'F#5', type: 'black', qwerty: 'L' },
  { note: 'G5', type: 'white', qwerty: 'Z' },
  { note: 'G#5', type: 'black', qwerty: 'X' },
  { note: 'A5', type: 'white', qwerty: 'C' },
  { note: 'A#5', type: 'black', qwerty: 'V' },
  { note: 'B5', type: 'white', qwerty: 'B' },
  { note: 'C6', type: 'white', qwerty: 'N' }
];

/* Build QWERTY → note lookup */
const QWERTY_MAP = {};
KEY_LAYOUT.forEach(k => { QWERTY_MAP[k.qwerty] = k.note; });

/* ── Current Mode ───────────────────────────────────────── */
let currentMode = 'classical';

/* ── Build Piano Keyboard ───────────────────────────────── */
const keyboard = document.getElementById('pianoKeyboard');

function buildKeyboard() {
  keyboard.innerHTML = '';

  // Wrap in frames
  const frame = document.createElement('div');
  frame.className = 'piano-keys-frame';
  frame.style.cssText = `
    background:#111; padding:12px 8px 0; position:relative;
    display:flex; justify-content:center; align-items:flex-start;
    width:100%; min-height:140px;
  `;

  /* White key positions + black key offsets */
  const whiteKeys = KEY_LAYOUT.filter(k => k.type === 'white');
  const blackKeys = KEY_LAYOUT.filter(k => k.type === 'black');

  // White key width (px), gap between
  const WW = 44; // white key width
  const GAP = 2; // gap between white keys

  let whiteEls = {}; // note → element

  // First render white keys absolutely within frame
  const whiteContainer = document.createElement('div');
  whiteContainer.style.cssText = `
    position:relative; display:flex; gap:${GAP}px; align-items:flex-start;
  `;

  whiteKeys.forEach((k, idx) => {
    const el = document.createElement('div');
    el.className = 'key-white';
    el.id = `key-${k.note.replace('#', 's')}`;
    el.dataset.note = k.note;
    el.style.width = WW + 'px';

    // Note label + QWERTY letter
    el.innerHTML = `
      <span class="key-note">${k.note}</span>
      <span class="key-letter">${k.qwerty}</span>
    `;

    el.addEventListener('mousedown', (e) => { e.preventDefault(); playNote(k.note, el); });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); playNote(k.note, el); }, { passive: false });

    whiteEls[k.note] = { el, idx };
    whiteContainer.appendChild(el);
  });

  // Black keys overlaid
  // Build a lookup: which white key comes before each black key
  // We track the white index sequence
  const fullSeq = KEY_LAYOUT; // C D E F G A B / C D E ...
  // For each black key, find left position relative to white keys
  // Black key sits between its left and right white neighbours
  let whiteCount = 0;
  const blackPositions = []; // { note, qwerty, leftFraction }

  for (let i = 0; i < fullSeq.length; i++) {
    const k = fullSeq[i];
    if (k.type === 'white') {
      whiteCount++;
    } else {
      // black key sits at whiteCount-0.5 white-key positions
      blackPositions.push({ ...k, whitesBefore: whiteCount - 0.5 });
    }
  }

  // Append black keys absolutely
  blackPositions.forEach(bk => {
    const el = document.createElement('div');
    el.className = 'key-black';
    el.id = `key-${bk.note.replace('#', 's')}`;
    el.dataset.note = bk.note;

    const leftPx = bk.whitesBefore * (WW + GAP) - 14; // center over gap
    el.style.left = leftPx + 'px';
    el.style.position = 'absolute';

    el.innerHTML = `<span class="key-letter">${bk.qwerty}</span>`;

    el.addEventListener('mousedown', (e) => { e.preventDefault(); playNote(bk.note, el); });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); playNote(bk.note, el); }, { passive: false });

    whiteContainer.appendChild(el);
  });

  frame.appendChild(whiteContainer);
  keyboard.appendChild(frame);
}

/* ── Play a Note ────────────────────────────────────────── */
function playNote(note, el) {
  const ctx = getAudioCtx();
  const freq = NOTE_FREQ[note];
  if (!freq) return;

  /* Mode-dependent synthesis */
  if (currentMode === 'classical') {
    playClassical(ctx, freq);
  } else {
    playFusion(ctx, freq);
  }

  /* Visual feedback */
  if (el) {
    el.classList.add('pressed');
    addRipple(el);
    setTimeout(() => el.classList.remove('pressed'), 200);
  }
}

/* ── Classical: harmonium-like tone ─────────────────────── */
function playClassical(ctx, freq) {
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.4);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);

  // Fundamental: sine
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = freq;

  // 2nd harmonic: triangle (softer)
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = freq * 2;

  const gain2 = ctx.createGain();
  gain2.gain.value = 0.18;

  // Slight vibrato
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 5.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);

  osc1.connect(gainNode);
  osc2.connect(gain2);
  gain2.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;
  osc1.start(now); osc1.stop(now + 1.5);
  osc2.start(now); osc2.stop(now + 1.5);
  lfo.start(now); lfo.stop(now + 1.5);
}

/* ── Fusion: electronic synth tone ──────────────────────── */
function playFusion(ctx, freq) {
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.15);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

  // Sawtooth carrier
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = freq;

  // Square sub
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = freq * 0.5;

  const gain2 = ctx.createGain();
  gain2.gain.value = 0.12;

  // Distortion / waveshaper
  const distortion = ctx.createWaveShaper();
  distortion.curve = makeDistortionCurve(60);
  distortion.oversample = '2x';

  // Filter (slightly lowpass for warmth)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq * 6;
  filter.Q.value = 1;

  osc1.connect(distortion);
  distortion.connect(filter);
  osc2.connect(gain2);
  gain2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;
  osc1.start(now); osc1.stop(now + 0.9);
  osc2.start(now); osc2.stop(now + 0.9);
}

function makeDistortionCurve(amount) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/* ── Ripple Effect ───────────────────────────────────────── */
function addRipple(el) {
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = el.getBoundingClientRect();
  ripple.style.left = '50%';
  ripple.style.top = '40%';
  ripple.style.transform = 'translate(-50%, -50%) scale(0)';
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

/* ── QWERTY Keyboard Support ────────────────────────────── */
const pressedKeys = new Set();

document.addEventListener('keydown', (e) => {
  const key = e.key.toUpperCase();
  if (pressedKeys.has(key)) return; // no key-repeat
  pressedKeys.add(key);

  const note = QWERTY_MAP[key];
  if (note) {
    const el = document.getElementById(`key-${note.replace('#', 's')}`);
    playNote(note, el);
  }
});

document.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.key.toUpperCase());
});

/* ── Mode Toggle ─────────────────────────────────────────── */
function setMode(mode) {
  currentMode = mode;
  document.body.setAttribute('data-mode', mode);

  document.getElementById('btnClassical').classList.toggle('active', mode === 'classical');
  document.getElementById('btnFusion').classList.toggle('active', mode === 'fusion');

  // Restart particles with new colors
  initParticles();
}

/* ── Preset Melodies ────────────────────────────────────── */
// Each step: [qwerty_key, duration_ms]
// Raga Bhupali (Sa Re Ga Pa Dha — pentatonic): C D E G A ascending then descending with ornamentation
const PRESET_BHUPALI = [
  ['Q', '280'], ['E', '280'], ['T', '320'],  // Sa Re Ga (arise)
  ['I', '300'], ['P', '380'],              // Pa Dha (settle)
  ['D', '320'], ['G', '280'], ['J', '340'], // upper Sa Re Ga (climb)
  ['Z', '320'], ['C', '500'],             // upper Pa Dha (peak, hold)
  ['C', '260'], ['Z', '260'], ['J', '280'], // descend Dha Pa Ga
  ['G', '280'], ['D', '320'],             // Re Sa (upper octave)
  ['P', '300'], ['I', '280'],             // Dha Pa (middle)
  ['T', '320'], ['E', '280'], ['Q', '600'] // Ga Re Sa (home, long finish)
];

// Raga Yaman (Sa Re Ga Ma# Pa Dha Ni): C D E F# G A B — full evening raga feel
const PRESET_YAMAN = [
  ['Q', '260'],                          // Sa (opening)
  ['E', '260'], ['T', '280'],             // Re Ga (rise)
  ['U', '300'], ['I', '320'],             // Ma# Pa (tivra Ma, distinctive)
  ['P', '300'], ['B', '360'],             // Dha Ni (smooth)
  ['N', '500'],                          // upper Sa (peak, hold)
  ['B', '280'], ['P', '280'],             // Ni Dha (float down)
  ['I', '300'], ['U', '320'],             // Pa Ma# (tivra descent)
  ['T', '280'], ['E', '280'],             // Ga Re
  ['Q', '600']                           // Sa (resolution, long)
];

const PRESETS = [PRESET_BHUPALI, PRESET_YAMAN];

let melodyPlaying = false;

async function playPreset(idx) {
  if (melodyPlaying) return;
  melodyPlaying = true;

  const seq = PRESETS[idx];
  const btn = document.getElementById(`melody${idx + 1}`);
  if (btn) { btn.style.opacity = '0.6'; btn.textContent = '▶ Playing…'; }

  for (let i = 0; i < seq.length; i++) {
    const [qkey, durStr] = seq[i];
    const note = QWERTY_MAP[qkey];
    if (note) {
      const el = document.getElementById(`key-${note.replace('#', 's')}`);
      playNote(note, el);
    }
    await sleep(parseInt(durStr, 10));
  }

  if (btn) {
    btn.style.opacity = '1';
    btn.textContent = idx === 0 ? '▶ Raga Bhupali' : '▶ Raga Yaman';
  }
  melodyPlaying = false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── Particle Background ─────────────────────────────────── */
let particleAnimFrame = null;
let particles = [];

function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx2 = canvas.getContext('2d');

  cancelAnimationFrame(particleAnimFrame);

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const isClassical = currentMode === 'classical';
  const colors = isClassical
    ? ['rgba(251,191,36,0.6)', 'rgba(249,115,22,0.5)', 'rgba(255,255,255,0.4)', 'rgba(253,186,116,0.5)']
    : ['rgba(34,197,94,0.5)', 'rgba(74,222,128,0.4)', 'rgba(134,239,172,0.35)', 'rgba(249,115,22,0.3)'];

  const COUNT = 55;
  particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 3 + 1,
    dx: (Math.random() - 0.5) * 0.5,
    dy: -Math.random() * 0.6 - 0.2,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: Math.random() * 0.6 + 0.2,
    shape: Math.random() > 0.5 ? 'circle' : 'dot'
  }));

  function draw() {
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx2.globalAlpha = p.alpha;
      ctx2.fillStyle = p.color;
      ctx2.beginPath();
      if (p.shape === 'circle') {
        ctx2.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      } else {
        ctx2.rect(p.x, p.y, p.r * 1.5, p.r * 1.5);
      }
      ctx2.fill();

      p.x += p.dx;
      p.y += p.dy;

      if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
      if (p.x < -5) p.x = canvas.width + 5;
      if (p.x > canvas.width + 5) p.x = -5;
    });
    ctx2.globalAlpha = 1;
    particleAnimFrame = requestAnimationFrame(draw);
  }
  draw();
}

window.addEventListener('resize', () => {
  const canvas = document.getElementById('particleCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

/* ── Init on DOM ready ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildKeyboard();
  initParticles();
});
