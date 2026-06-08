import './style.css';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  MathUtils,
} from 'three';
import {
  COLORS,
  check,
  cycleLight,
  newGame,
  reset,
  type GameState,
  type GameStatus,
} from './game/mastermind';
import { createBoxView, setLamp, type Interactive } from './scene/box';
import { CONFIG } from './config';
import { createNoteOverlay, decodeNote } from './note';

const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0.02, 0.42);

// Zoom = camera distance along z, bounded so the box can't invert or vanish.
const MIN_Z = 0.18;
const MAX_Z = 1.2;
const zoomTo = (z: number): void => {
  camera.position.z = MathUtils.clamp(z, MIN_Z, MAX_Z);
};

scene.add(new AmbientLight(0xffffff, 0.6));
const key = new DirectionalLight(0xffffff, 1.1);
key.position.set(0.2, 0.4, 0.5);
scene.add(key);

const view = createBoxView();
view.group.rotation.y = 0.12; // slight angle so depth reads
scene.add(view.group);

// --- Game state ---------------------------------------------------------
let state: GameState = newGame();

function logSecret(): void {
  if (CONFIG.debug.revealSecret) console.log('[debug] secret:', state.secret.join(' '));
}
logSecret();

function syncLights(): void {
  state.guess.forEach((s, i) => setLamp(view.lights[i], s));
}
syncLights();

/** Begin a fresh round: new secret, cleared lights, re-randomized clutter. */
function restartRound(): void {
  reset(state);
  view.refillClutter();
  logSecret();
  stopFlash(); // stop the previous round's feedback flashing
  lastCheckedGuess = null; // first check of the new round is always allowed
  startResetFlash(); // rainbow chase, then the lights settle off
}

// --- Box open/close: phase machine -------------------------------------
// revealing: box rotates to show its back, then the tray slides out + tips.
// open:      tray is out; the box rotates FREELY (not locked).
// hiding:    tray slides back in, box rotates to front, round resets.
type Phase = 'idle' | 'revealing' | 'open' | 'hiding';
let phase: Phase = 'idle';

const innerBase = view.innerBox.position.clone();
const TRAY_SLIDE = 0.09;
const OPEN_SPEED = 1.1; // tray slide/tip progress per second
const FRONT_VIEW = { x: 0, y: 0.12 };
const BACK_VIEW = { x: 0.55, y: Math.PI };

let openProgress = 0; // tray: 0 in → 1 fully out + tipped
let openTarget = 0;
let lossResetCountdown = 0; // brief pause before a losing round restarts
let hideRotated = false; // hiding sub-step latch

const smoothstep = (a: number, b: number, x: number): number => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// One-shot orientation tween (used only for the reveal/hide turns).
let orient: { fromX: number; fromY: number; toX: number; toY: number; t: number; dur: number } | null =
  null;
function startOrient(to: { x: number; y: number }, dur = 0.65): void {
  orient = { fromX: view.group.rotation.x, fromY: view.group.rotation.y, toX: to.x, toY: to.y, t: 0, dur };
}
function updateOrient(dt: number): void {
  if (!orient) return;
  orient.t += dt;
  const k = smoothstep(0, 1, Math.min(orient.t / orient.dur, 1));
  view.group.rotation.x = MathUtils.lerp(orient.fromX, orient.toX, k);
  view.group.rotation.y = MathUtils.lerp(orient.fromY, orient.toY, k);
  if (orient.t >= orient.dur) orient = null;
}
const orienting = (): boolean => orient !== null;

function applyTray(): void {
  const slide = smoothstep(0, 0.6, openProgress);
  const tip = smoothstep(0.55, 1, openProgress);
  view.innerBox.position.z = innerBase.z - slide * TRAY_SLIDE;
  view.innerBox.rotation.x = -tip * (Math.PI / 2);
}

// Reset flash: a rainbow chase across the 5 lights, then they settle off.
const RESET_FLASH_DUR = 1.1;
const resetFlash = { active: false, t: 0 };
function startResetFlash(): void {
  resetFlash.active = true;
  resetFlash.t = 0;
}
function updateResetFlash(dt: number): void {
  if (!resetFlash.active) return;
  resetFlash.t += dt;
  if (resetFlash.t >= RESET_FLASH_DUR) {
    resetFlash.active = false;
    syncLights(); // settle to the (empty) new guess: all off
    return;
  }
  const step = Math.floor(resetFlash.t * 12);
  for (let i = 0; i < view.lights.length; i++) {
    setLamp(view.lights[i], COLORS[(step + i) % COLORS.length]);
  }
}

// Manual drag is allowed only when nothing is animating itself.
const canManualRotate = (): boolean => phase === 'idle' || phase === 'open';
const isBusy = (): boolean =>
  phase !== 'idle' || lossResetCountdown > 0 || resetFlash.active;

function startReveal(): void {
  phase = 'revealing';
  startOrient(BACK_VIEW); // tray waits until this turn finishes
}

// --- Feedback indicators: flash `count` times, pause, repeat forever ----
const FLASH_ON = 0.22;
const FLASH_OFF = 0.2;
const FLASH_PAUSE = 3.0; // seconds between bursts

interface Flasher {
  count: number; // flashes per burst (0 = idle/off)
  remaining: number;
  phase: 'on' | 'off' | 'pause';
  timer: number;
}
const flashers: [Flasher, Flasher] = [
  { count: 0, remaining: 0, phase: 'off', timer: 0 },
  { count: 0, remaining: 0, phase: 'off', timer: 0 },
];

function updateFlasher(f: Flasher, mesh: Mesh, dt: number): void {
  if (f.count <= 0) {
    setLamp(mesh, 'off');
    return;
  }
  f.timer -= dt;
  if (f.timer <= 0) {
    if (f.phase === 'on') {
      f.phase = 'off';
      f.timer = FLASH_OFF;
      f.remaining--;
    } else if (f.phase === 'off') {
      if (f.remaining > 0) {
        f.phase = 'on';
        f.timer = FLASH_ON;
      } else {
        f.phase = 'pause';
        f.timer = FLASH_PAUSE;
      }
    } else {
      // pause finished — start the next burst
      f.remaining = f.count;
      f.phase = 'on';
      f.timer = FLASH_ON;
    }
  }
  setLamp(mesh, f.phase === 'on' ? 'white' : 'off');
}

function startFlash(colorOnly: number, exact: number): void {
  flashers[0] = { count: colorOnly, remaining: colorOnly, phase: 'on', timer: FLASH_ON };
  flashers[1] = { count: exact, remaining: exact, phase: 'on', timer: FLASH_ON };
}

function stopFlash(): void {
  flashers[0].count = 0;
  flashers[1].count = 0;
}

// --- Check / interaction ------------------------------------------------
function guessMatchesMaster(): boolean {
  const m = CONFIG.debug.masterCode;
  return (
    m.enabled &&
    state.guess.length === m.code.length &&
    state.guess.every((g, i) => g === m.code[i])
  );
}

// The unfolded-paper overlay; closing it puts the 3D note back in the tray.
const noteOverlay = createNoteOverlay(() => {
  view.note.visible = true;
});

// The guess that was last checked; a new check only counts if it changed.
let lastCheckedGuess: string | null = null;

function handleCheck(): void {
  if (isBusy() || state.status !== 'playing') return;

  // Every light must be set (at least to "red") before a check counts.
  if (state.guess.some((g) => g === 'off')) return;

  // Ignore a check if the combination hasn't changed since the last one.
  const key = state.guess.join(',');
  if (key === lastCheckedGuess) return;
  lastCheckedGuess = key;

  // Debug master code always opens the box.
  if (guessMatchesMaster()) {
    startReveal();
    return;
  }

  const record = check(state);
  startFlash(record.colorOnly, record.exact);

  // `check` mutated status; widen past the guard's narrowing.
  const status = state.status as GameStatus;
  if (status === 'won') {
    startReveal(); // box opens on a real solve too
  } else if (status === 'lost') {
    lossResetCountdown = 2.8; // brief pause, then a new round (box stays shut)
  }
}

function handleInteractive(tag: Interactive): void {
  if (tag.kind === 'container') {
    if (phase === 'open') {
      phase = 'hiding'; // slide tray back in, then reset
      openTarget = 0;
    }
    return;
  }
  if (tag.kind === 'note') {
    if (phase === 'open' && !noteOverlay.visible) {
      view.note.visible = false;
      noteOverlay.show(decodeNote(CONFIG.note.encoded));
    }
    return;
  }
  if (tag.kind === 'check') {
    handleCheck();
    return;
  }
  // tag.kind === 'button'
  if (isBusy() || state.status !== 'playing') return;
  cycleLight(state, tag.index);
  syncLights();
}

// --- Input: drag to rotate, pinch/scroll to zoom, tap to press ----------
const raycaster = new Raycaster();
const ndc = new Vector2();
const DRAG_THRESHOLD = 8; // px

// Active pointers by id, so we can tell one-finger drag from two-finger pinch.
const pointers = new Map<number, { x: number; y: number }>();
let downAt: { x: number; y: number } | null = null;
let dragging = false;
let lastX = 0;
let lastY = 0;
let pinchStartDist = 0;
let pinchStartZoom = 0;

const pinchDistance = (): number => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};

canvas.addEventListener('pointerdown', (e) => {
  if (noteOverlay.visible) return; // note is modal
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 1) {
    downAt = { x: e.clientX, y: e.clientY };
    dragging = false;
    lastX = e.clientX;
    lastY = e.clientY;
  } else if (pointers.size === 2) {
    pinchStartDist = pinchDistance();
    pinchStartZoom = camera.position.z;
    dragging = true; // a second finger cancels any pending tap
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    // Pinch: zoom proportionally to the change in finger spread.
    if (pinchStartDist > 0) zoomTo(pinchStartZoom * (pinchStartDist / pinchDistance()));
    return;
  }

  if (!downAt) return;
  const dx = e.clientX - downAt.x;
  const dy = e.clientY - downAt.y;
  if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragging = true;
  if (dragging && canManualRotate()) {
    view.group.rotation.y += (e.clientX - lastX) * 0.01;
    view.group.rotation.x = MathUtils.clamp(
      view.group.rotation.x + (e.clientY - lastY) * 0.01,
      -1.0,
      1.0,
    );
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

function endPointer(e: PointerEvent): void {
  const wasSingleTap = pointers.size === 1 && downAt && !dragging;
  if (wasSingleTap) tap(e.clientX, e.clientY);
  pointers.delete(e.pointerId);
  if (pointers.size === 0) downAt = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Desktop: scroll wheel zooms.
canvas.addEventListener(
  'wheel',
  (e) => {
    if (noteOverlay.visible) return;
    e.preventDefault();
    zoomTo(camera.position.z + e.deltaY * 0.0006);
  },
  { passive: false },
);

function tap(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(view.interactives, false);
  const tag = hits[0]?.object.userData.tag as Interactive | undefined;
  if (tag) {
    // Physical buttons travel inward when pressed.
    if (tag.kind === 'button' || tag.kind === 'check') {
      const cap = hits[0].object.userData.press as Object3D | undefined;
      if (cap) pressCap(cap);
    }
    handleInteractive(tag);
  }
}

// --- Button press travel (dome pushes in, then springs back) ------------
const PRESS_DEPTH = 0.0016;
const PRESS_DUR = 0.18; // seconds, in-and-out
const activePresses = new Set<Object3D>();

function pressCap(cap: Object3D): void {
  if (cap.userData.baseZ === undefined) cap.userData.baseZ = cap.position.z;
  cap.userData.pressT = 0;
  activePresses.add(cap);
}

function updatePresses(dt: number): void {
  for (const cap of activePresses) {
    const t = (cap.userData.pressT as number) + dt;
    cap.userData.pressT = t;
    const baseZ = cap.userData.baseZ as number;
    if (t >= PRESS_DUR) {
      cap.position.z = baseZ;
      activePresses.delete(cap);
    } else {
      const half = PRESS_DUR / 2;
      const k = t < half ? t / half : 1 - (t - half) / half; // 0 → 1 → 0
      cap.position.z = baseZ - PRESS_DEPTH * k;
    }
  }
}

// --- Resize -------------------------------------------------------------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Render loop --------------------------------------------------------
let prev = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;

  updateFlasher(flashers[0], view.indicators[0], dt);
  updateFlasher(flashers[1], view.indicators[1], dt);
  updatePresses(dt);
  updateResetFlash(dt);

  updateOrient(dt);

  // Ease the tray toward open/closed.
  const step = OPEN_SPEED * dt;
  openProgress = MathUtils.clamp(
    openProgress + Math.sign(openTarget - openProgress) * step,
    0,
    1,
  );
  applyTray();

  // Reveal: once the turn-to-back finishes, slide the tray out; then it's open.
  if (phase === 'revealing' && !orienting()) {
    openTarget = 1;
    if (openProgress >= 0.999) phase = 'open';
  }

  // Hide: tray slides in, then the box turns back to front, then round resets.
  if (phase === 'hiding' && openProgress <= 0.001) {
    if (!orienting() && !hideRotated) {
      startOrient(FRONT_VIEW);
      hideRotated = true;
    } else if (!orienting() && hideRotated) {
      hideRotated = false;
      phase = 'idle';
      restartRound();
    }
  }

  // Losing path: short pause, then restart (box stays shut throughout).
  if (lossResetCountdown > 0) {
    lossResetCountdown -= dt;
    if (lossResetCountdown <= 0) {
      lossResetCountdown = 0;
      restartRound();
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
