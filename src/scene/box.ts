import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Color as ThreeColor,
} from 'three';
import { CODE_LENGTH, type LightState } from '../game/mastermind';
import { BOX, LIGHT_HEX } from './constants';

/** Tags for raycast hit-testing in the input layer. */
export type Interactive =
  | { kind: 'button'; index: number }
  | { kind: 'check' }
  | { kind: 'container' }
  | { kind: 'note' };

export interface BoxView {
  group: Group;
  /** Display lamps for the player's current guess (middle row). */
  lights: Mesh[];
  /** Pressable switches, one under each light. */
  buttons: Mesh[];
  /** The check button (top, between the indicators). */
  checkButton: Mesh;
  /** [left = color-only, right = exact] feedback indicators (top). */
  indicators: [Mesh, Mesh];
  /**
   * Half-depth open tray. Its closed end IS the back of the box (back texture
   * + tabs); on open the whole tray slides out and rotates to reveal contents.
   */
  innerBox: Group;
  /** The permanent folded note at the bottom of the tray. */
  note: Mesh;
  /** Re-randomize the clutter inside the tray (call between rounds). */
  refillClutter: () => void;
  /** Every mesh the raycaster should test, pre-tagged via userData.tag. */
  interactives: Mesh[];
}

const FRONT_Z = BOX.depth / 2;
const WALL = 0.004; // shell panel thickness

// Material palette — tan MDF to echo the real box.
const SHELL = 0x9a7b54;
const SHELL_DARK = 0x6f573a;
const INNER = 0x5c4631;

// --- MDF / fibreboard surface texture ----------------------------------
// Drawn in grayscale so each panel's `color` tints it to the right tone.

/** Paint a fibreboard surface (mottling + fine speckle) onto a context. */
function drawMdf(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = '#d3cec5';
  ctx.fillRect(0, 0, W, H);

  // Soft fibre clumps (stronger so the mottling reads from a distance).
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 14 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    const a = 0.1 + Math.random() * 0.16;
    g.addColorStop(0, dark ? `rgba(104,95,78,${a})` : `rgba(247,243,233,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // Fine speckle (the pressed-fibre grain) — higher contrast.
  const n = Math.floor((W * H) / 18);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle =
      Math.random() < 0.55
        ? `rgba(74,67,54,${0.2 + Math.random() * 0.5})`
        : `rgba(250,247,239,${0.15 + Math.random() * 0.45})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Sparse larger chips/flecks so grain is obvious without zooming in.
  const chips = Math.floor((W * H) / 1400);
  for (let i = 0; i < chips; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const s = 1.5 + Math.random() * 2.5;
    ctx.fillStyle =
      Math.random() < 0.6
        ? `rgba(66,58,44,${0.3 + Math.random() * 0.4})`
        : `rgba(252,249,242,${0.25 + Math.random() * 0.4})`;
    ctx.fillRect(x, y, s, s);
  }
}

/** Engraved laser-cut frame + finger-joint ticks for the front face. */
function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const margin = Math.min(W, H) * 0.06;
  const eng = (x: number, y: number, w: number, h: number) => {
    ctx.strokeStyle = 'rgba(68,60,46,0.5)';
    ctx.lineWidth = Math.max(2, W * 0.006);
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,250,238,0.16)'; // burnt-edge highlight
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  };
  eng(margin, margin, W - 2 * margin, H - 2 * margin);

  // Finger-joint ticks between the frame and the outer edge.
  ctx.strokeStyle = 'rgba(58,50,36,0.5)';
  ctx.lineWidth = Math.max(1.5, W * 0.004);
  ctx.lineCap = 'round';
  const tick = margin * 0.55;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  const nx = 6;
  for (let i = 1; i < nx; i++) {
    const x = (W * i) / nx;
    line(x, margin * 0.25, x, margin * 0.25 + tick);
    line(x, H - margin * 0.25, x, H - margin * 0.25 - tick);
  }
  const ny = 4;
  for (let i = 1; i < ny; i++) {
    const y = (H * i) / ny;
    line(margin * 0.25, y, margin * 0.25 + tick, y);
    line(W - margin * 0.25, y, W - margin * 0.25 - tick, y);
  }
}

function makeGrainTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  drawMdf(c.getContext('2d')!, 512, 512);
  const t = new CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/** Front-face texture at the panel's aspect, with grain + engraved frame. */
function makeFrontTexture(): CanvasTexture {
  const W = 512;
  const H = Math.round(512 * (BOX.height / BOX.width));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  drawMdf(ctx, W, H);
  drawFrame(ctx, W, H);
  const t = new CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

// Shared grain texture for the plain panels (created on first use).
let grainTex: CanvasTexture | null = null;
const grain = (): CanvasTexture => (grainTex ??= makeGrainTexture());

/** Evenly spread N item x-positions across `span` of the width. */
function rowXs(count: number, span: number): number[] {
  if (count === 1) return [0];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + i * step);
}

/** A flat LED, flush with the panel (faces +z, no bump). */
function makeLamp(radius: number, state: LightState): Mesh {
  const mat = new MeshStandardMaterial({
    color: 0x0a0a0c,
    emissive: new ThreeColor(LIGHT_HEX[state]),
    emissiveIntensity: state === 'off' ? 0.15 : 1.6,
    roughness: 0.3,
    metalness: 0.0,
  });
  return new Mesh(new CircleGeometry(radius, 28), mat); // faces +z by default
}

/** White power symbol (⏻) on transparent background, for the CHECK button. */
function makePowerTexture(): CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2;
  const cy = S / 2;
  ctx.strokeStyle = '#eef3fa';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 30, -Math.PI / 2 + 0.55, -Math.PI / 2 - 0.55, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 34);
  ctx.lineTo(cx, cy + 2);
  ctx.stroke();
  const t = new CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

interface ButtonView {
  group: Group;
  /** The dome+symbol that travels inward when pressed. */
  cap: Group;
  /** Raycast targets (dome + collar), tagged by the caller. */
  hits: Mesh[];
}

/**
 * A panel-mount push-button: a chrome collar flush in the panel (integrated,
 * like an LED) with a rounded dark dome bumping out. `cap` is the pressable
 * part that the input layer pushes inward on click. With `symbol`, a power
 * glyph rides on the dome (the CHECK button).
 */
function makeDomeButton(radius: number, symbol = false): ButtonView {
  const group = new Group();
  const chrome = new MeshStandardMaterial({ color: 0xc2c7d0, roughness: 0.28, metalness: 0.95 });
  const dark = new MeshStandardMaterial({ color: 0x0e1320, roughness: 0.32, metalness: 0.45 });

  // Chrome collar, flat and flush with the panel.
  const collar = new Mesh(new RingGeometry(radius * 0.6, radius, 40), chrome);
  collar.position.z = 0.0005;
  group.add(collar);

  // Rounded dome (flattened sphere) bumping out of the collar.
  const cap = new Group();
  const domeR = radius * 0.66;
  const dome = new Mesh(new SphereGeometry(domeR, 32, 24), dark);
  dome.scale.z = 0.45; // flatten into a low dome
  cap.add(dome);

  const hits: Mesh[] = [dome, collar];

  if (symbol) {
    const sym = new Mesh(
      new CircleGeometry(radius * 0.5, 32),
      new MeshBasicMaterial({ map: makePowerTexture(), transparent: true }),
    );
    sym.position.z = domeR * 0.45 + 0.0006; // just above the dome's crown
    cap.add(sym);
  }

  group.add(cap);
  return { group, cap, hits };
}

function makePanel(w: number, h: number, d: number, color: number): Mesh {
  return new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color, map: grain(), roughness: 0.9, metalness: 0.0 }),
  );
}

/**
 * A flat text label drawn to a canvas texture, facing +z. Sized by glyph
 * HEIGHT (`worldHeight`) so different labels share a consistent font size;
 * the canvas auto-fits the text width.
 */
function makeLabel(text: string, worldHeight: number): Mesh {
  const fontPx = 96;
  const pad = 24;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `bold ${fontPx}px sans-serif`;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9d2c4';
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true });
  return new Mesh(new PlaneGeometry(worldHeight * (w / h), worldHeight), mat);
}

/** Update a lamp's emissive color to reflect a light state. */
export function setLamp(lamp: Mesh, state: LightState): void {
  const mat = lamp.material as MeshStandardMaterial;
  mat.emissive.setHex(LIGHT_HEX[state]);
  mat.emissiveIntensity = state === 'off' ? 0.15 : 1.4;
}

interface Tray {
  group: Group;
  note: Mesh;
  clutter: Group;
  /** Inner floor (back wall) z, for placing the note and clutter on it. */
  floorZ: number;
}

/**
 * An open tray (5 walls), opening facing +z, holding a permanent folded note
 * at the bottom plus a (re)fillable clutter group. Its closed end (`back`)
 * doubles as the box's back face: SHELL color + tab detailing, flush with the
 * shell's back opening.
 */
function makeTray(w: number, h: number, d: number): Tray {
  const tray = new Group();
  const t = 0.004;
  const back = makePanel(w, h, t, SHELL); // = the back of the whole box
  back.position.z = -d / 2 + t / 2; // closed end, away from the opening

  // Tab clips around the back, echoing Images/box_back.png.
  const tabMat = new MeshStandardMaterial({ color: SHELL_DARK, roughness: 0.8 });
  const halfW = w / 2;
  const halfH = h / 2;
  const tabW = 0.012;
  const tabH = 0.006;
  const tabSpots: [number, number][] = [
    [-halfW * 0.45, halfH - tabH],
    [halfW * 0.45, halfH - tabH],
    [-halfW * 0.45, -halfH + tabH],
    [halfW * 0.45, -halfH + tabH],
    [-halfW + tabH, 0],
    [halfW - tabH, 0],
  ];
  for (const [tx, ty] of tabSpots) {
    const onSide = Math.abs(tx) > halfW * 0.6;
    const tab = new Mesh(
      new BoxGeometry(onSide ? tabH : tabW, onSide ? tabW : tabH, t * 0.6),
      tabMat,
    );
    tab.position.set(tx, ty, -d / 2 - t * 0.6); // sits fully proud of the back face
    tab.userData.tag = { kind: 'container' } satisfies Interactive;
    tray.add(tab);
  }

  const top = makePanel(w, t, d, INNER);
  top.position.y = h / 2 - t / 2;
  const bottom = makePanel(w, t, d, INNER);
  bottom.position.y = -h / 2 + t / 2;
  const left = makePanel(t, h, d, INNER);
  left.position.x = -w / 2 + t / 2;
  const right = makePanel(t, h, d, INNER);
  right.position.x = w / 2 - t / 2;

  // All five walls are click targets to close the box again.
  for (const wall of [back, top, bottom, left, right]) {
    wall.userData.tag = { kind: 'container' } satisfies Interactive;
    tray.add(wall);
  }

  const floorZ = -d / 2 + t; // inner surface of the back wall

  // Permanent folded note, flat on the bottom centre.
  const note = makeNote(w * 0.5, h * 0.42);
  note.position.set(0, 0, floorZ + 0.0024);
  note.userData.tag = { kind: 'note' } satisfies Interactive;
  tray.add(note);

  // Clutter sits above the note (filled separately so it can be randomized).
  const clutter = new Group();
  tray.add(clutter);

  return { group: tray, note, clutter, floorZ };
}

/** Message written on the folded note's outer face. */
const NOTE_COVER_TEXT = 'За този който отвори кутията!';

/** Draw an aged, dirty, tri-folded sheet of paper with a handwritten message. */
function makeOldPaperCanvas(text: string): HTMLCanvasElement {
  const W = 512;
  const H = 288;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // Base paper tone.
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#cdbd92');
  base.addColorStop(0.5, '#c2af80');
  base.addColorStop(1, '#ad9968');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Paper fibre speckle.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const dark = Math.random() < 0.5;
    ctx.fillStyle = dark
      ? `rgba(70,52,24,${Math.random() * 0.12})`
      : `rgba(240,228,198,${Math.random() * 0.12})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Random age stains / water marks.
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 20 + Math.random() * 70;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + Math.random() * 0.18;
    stain.addColorStop(0, `rgba(74,50,20,${a})`);
    stain.addColorStop(0.7, `rgba(74,50,20,${a * 0.4})`);
    stain.addColorStop(1, 'rgba(74,50,20,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fold creases: two vertical (tri-fold) + one horizontal, as shadow+highlight.
  const crease = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.strokeStyle = 'rgba(60,42,16,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,235,205,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, y0);
    ctx.lineTo(x1 + 2, y1);
    ctx.stroke();
  };
  crease(W / 3, 0, W / 3, H);
  crease((W * 2) / 3, 0, (W * 2) / 3, H);
  crease(0, H / 2, W, H / 2);

  // Worn, darkened edges.
  ctx.lineWidth = 26;
  ctx.strokeStyle = 'rgba(50,34,12,0.45)';
  ctx.strokeRect(0, 0, W, H);

  // Handwritten-style message (sepia ink), wrapped and slightly skewed.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.03);
  ctx.fillStyle = '#3a2a12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 600 44px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(40,26,8,0.35)';
  ctx.shadowBlur = 2;

  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > W * 0.82 && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  lines.push(line);
  const lh = 52;
  lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * lh));
  ctx.restore();

  return c;
}

/** A folded old note: aged paper slab with the message on its outer face. */
function makeNote(w: number, h: number): Mesh {
  const tex = new CanvasTexture(makeOldPaperCanvas(NOTE_COVER_TEXT));
  tex.anisotropy = 8;
  const cover = new MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
  const edge = new MeshStandardMaterial({ color: 0x9a875b, roughness: 1, metalness: 0 });
  // Box face order: [+x, -x, +y, -y, +z, -z]; +z (top, toward opening) = cover.
  const note = new Mesh(new BoxGeometry(w, h, 0.004), [edge, edge, edge, edge, cover, edge]);
  note.rotation.z = (Math.random() - 0.5) * 0.12; // sits a little askew
  return note;
}

const CLUTTER_COLORS = [0x8a6f4e, 0x55606b, 0x7a3b3b, 0x394b3a, 0xb9a06a, 0x2e3742];

/** Clear and repopulate the clutter group with a few random small objects. */
export function fillClutter(
  clutter: Group,
  bounds: { w: number; h: number; floorZ: number },
  rng: () => number = Math.random,
): void {
  for (const child of [...clutter.children]) {
    clutter.remove(child);
    const m = child as Mesh;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat?.dispose());
  }

  const count = 3 + Math.floor(rng() * 4); // 3–6 items
  for (let i = 0; i < count; i++) {
    const s = 0.006 + rng() * 0.009;
    let geo: BufferGeometry;
    const shape = Math.floor(rng() * 4);
    if (shape === 0) geo = new BoxGeometry(s, s, s);
    else if (shape === 1) geo = new SphereGeometry(s * 0.6, 12, 12);
    else if (shape === 2) geo = new CylinderGeometry(s * 0.5, s * 0.5, s, 14);
    else geo = new IcosahedronGeometry(s * 0.6, 0);

    const color = CLUTTER_COLORS[Math.floor(rng() * CLUTTER_COLORS.length)];
    const mat: Material = new MeshStandardMaterial({
      color,
      roughness: 0.4 + rng() * 0.5,
      metalness: rng() < 0.4 ? 0.7 : 0.05,
    });
    const mesh = new Mesh(geo, mat);

    // Scatter toward the edges so the centre note stays clickable.
    const edge = 0.22 + rng() * 0.2;
    const angle = rng() * Math.PI * 2;
    mesh.position.set(
      Math.cos(angle) * bounds.w * edge,
      Math.sin(angle) * bounds.h * edge,
      bounds.floorZ + s * 0.6,
    );
    mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    clutter.add(mesh);
  }
}

/** Build the hollow box shell, front controls, back lid, and inner tray. */
export function createBoxView(): BoxView {
  const group = new Group();

  // --- Hollow shell: five panels, back left open for the lid -----------
  const front = new Mesh(
    new BoxGeometry(BOX.width, BOX.height, WALL),
    new MeshStandardMaterial({ color: SHELL, map: makeFrontTexture(), roughness: 0.9, metalness: 0 }),
  );
  front.position.z = FRONT_Z - WALL / 2;
  // Side panels are shortened by WALL/2 and shifted back so their front edge
  // tucks INSIDE the front panel instead of being coplanar with its face
  // (coplanar faces z-fight and flicker when rotating).
  const sideD = BOX.depth - WALL / 2;
  const sideZ = -WALL / 4;
  const top = makePanel(BOX.width, WALL, sideD, SHELL_DARK);
  top.position.set(0, BOX.height / 2 - WALL / 2, sideZ);
  const bottom = makePanel(BOX.width, WALL, sideD, SHELL_DARK);
  bottom.position.set(0, -BOX.height / 2 + WALL / 2, sideZ);
  const left = makePanel(WALL, BOX.height, sideD, SHELL_DARK);
  left.position.set(-BOX.width / 2 + WALL / 2, 0, sideZ);
  const right = makePanel(WALL, BOX.height, sideD, SHELL_DARK);
  right.position.set(BOX.width / 2 - WALL / 2, 0, sideZ);
  group.add(front, top, bottom, left, right);

  // --- Inner tray: half the box depth, opening toward the panel --------
  const cavW = BOX.width - 2 * WALL;
  const cavH = BOX.height - 2 * WALL;
  const cavD = BOX.depth - 2 * WALL;
  const innerD = cavD * 0.5;
  const trayT = 0.004;
  const trayW = cavW * 0.96;
  const trayH = cavH * 0.96;
  const tray = makeTray(trayW, trayH, innerD);
  const innerBox = tray.group;
  // Closed: tray back wall flush with the shell's back face (it IS the back).
  innerBox.position.z = -BOX.depth / 2 + innerD / 2 + trayT / 2;
  group.add(innerBox);
  const refillClutter = (): void =>
    fillClutter(tray.clutter, { w: trayW, h: trayH, floorZ: tray.floorZ });
  refillClutter();

  // --- Front controls --------------------------------------------------
  const xs = rowXs(CODE_LENGTH, BOX.width * 0.72);
  const lights: Mesh[] = [];
  const buttons: Mesh[] = [];
  const interactives: Mesh[] = [];

  // Uniform vertical gap, matching the CHECK-label → CHECK-button spacing.
  const GAP = BOX.height * 0.16;
  const Y_CHECK = BOX.height * 0.36;
  const Y_CHECK_LABEL = Y_CHECK - GAP;
  const Y_SWITCH = -BOX.height * 0.34;
  const Y_QMARK = Y_SWITCH + GAP; // "?" one gap above the button
  const Y_LIGHT = Y_QMARK + GAP; // light one gap above the "?"
  const FACE = FRONT_Z + 0.002;
  const LAMP_Z = FRONT_Z + 0.0003; // flush LEDs, integrated into the panel
  const LABEL_H = 0.0085; // shared label glyph height
  const SWITCH_R = 0.0072; // 20% smaller than before
  const LAMP_R = SWITCH_R / 2; // LEDs are half the button size

  const tagPress = (b: ButtonView, tag: Interactive) => {
    for (const m of b.hits) {
      m.userData.tag = tag;
      m.userData.press = b.cap; // input layer pushes this inward on click
      interactives.push(m);
    }
  };

  // Check button + two indicators at the top.
  const check = makeDomeButton(SWITCH_R, true);
  check.group.position.set(0, Y_CHECK, FRONT_Z);
  tagPress(check, { kind: 'check' });
  group.add(check.group);
  const checkButton = check.hits[0];

  const left2 = makeLamp(LAMP_R, 'off');
  left2.position.set(-0.02, Y_CHECK, LAMP_Z);
  const right2 = makeLamp(LAMP_R, 'off');
  right2.position.set(0.02, Y_CHECK, LAMP_Z);
  group.add(left2, right2);

  const checkLabel = makeLabel('CHECK', LABEL_H);
  checkLabel.position.set(0, Y_CHECK_LABEL, FACE);
  group.add(checkLabel);

  // Light row, a "?" under each, and a button under that.
  xs.forEach((x, i) => {
    const lamp = makeLamp(LAMP_R, 'off');
    lamp.position.set(x, Y_LIGHT, LAMP_Z);
    group.add(lamp);
    lights.push(lamp);

    const q = makeLabel('?', LABEL_H);
    q.position.set(x, Y_QMARK, FACE);
    group.add(q);

    const b = makeDomeButton(SWITCH_R);
    b.group.position.set(x, Y_SWITCH, FRONT_Z);
    tagPress(b, { kind: 'button', index: i });
    group.add(b.group);
    buttons.push(b.hits[0]);
  });

  // Tray walls are click targets to close the box.
  innerBox.traverse((o) => {
    if ((o as Mesh).isMesh && o.userData.tag) interactives.push(o as Mesh);
  });

  return {
    group,
    lights,
    buttons,
    checkButton,
    indicators: [left2, right2],
    innerBox,
    note: tray.note,
    refillClutter,
    interactives,
  };
}
