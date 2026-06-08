/**
 * Pure Mastermind game logic for the puzzle box.
 *
 * This module is intentionally free of Three.js and DOM dependencies so it can
 * be unit-tested in isolation. The presentation layer reads `GameState` and
 * calls the operations below; it must never reach into the internals.
 */

/** The six guessable colors. The secret is always made of these (never `off`). */
export const COLORS = ['red', 'green', 'blue', 'white', 'magenta', 'cyan'] as const;
export type Color = (typeof COLORS)[number];

/** A light's visual state: unset (`off`) or one of the six colors. */
export type LightState = Color | 'off';

/** Number of guess lights / code length. */
export const CODE_LENGTH = 5;

/** Checks allowed before the secret resets for a new round. */
export const MAX_CHECKS = 6;

/**
 * Cycle order driven by each light's button:
 * off → red → green → blue → white → magenta → cyan → off.
 */
export const LIGHT_CYCLE: readonly LightState[] = ['off', ...COLORS];

export interface Feedback {
  /** Pegs with the correct color in the correct position (right indicator). */
  exact: number;
  /** Pegs with a correct color but in the wrong position (left indicator). */
  colorOnly: number;
}

export interface CheckRecord extends Feedback {
  /** Snapshot of the guess that produced this feedback. */
  guess: LightState[];
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  readonly secret: Color[];
  guess: LightState[];
  history: CheckRecord[];
  checksUsed: number;
  status: GameStatus;
}

/** Injectable RNG for deterministic tests. Returns a float in [0, 1). */
export type Rng = () => number;

function randomColor(rng: Rng): Color {
  return COLORS[Math.floor(rng() * COLORS.length)];
}

/** Generate a fresh secret code. Colors may repeat across positions. */
export function generateSecret(rng: Rng = Math.random): Color[] {
  return Array.from({ length: CODE_LENGTH }, () => randomColor(rng));
}

/** Start a new game with a randomly generated secret and all lights off. */
export function newGame(rng: Rng = Math.random): GameState {
  return {
    secret: generateSecret(rng),
    guess: Array.from({ length: CODE_LENGTH }, () => 'off' as LightState),
    history: [],
    checksUsed: 0,
    status: 'playing',
  };
}

/** Advance a single light to the next state in the cycle (mutates `state`). */
export function cycleLight(state: GameState, index: number): GameState {
  if (index < 0 || index >= CODE_LENGTH) {
    throw new RangeError(`light index out of range: ${index}`);
  }
  const current = state.guess[index];
  const next = (LIGHT_CYCLE.indexOf(current) + 1) % LIGHT_CYCLE.length;
  state.guess[index] = LIGHT_CYCLE[next];
  return state;
}

/**
 * Standard two-count Mastermind feedback. `off` lights match nothing.
 * `colorOnly` counts color matches in the wrong place: per-color
 * min(guessCount, secretCount) summed, then minus the exact matches.
 */
export function computeFeedback(guess: LightState[], secret: Color[]): Feedback {
  let exact = 0;
  const guessCounts = new Map<Color, number>();
  const secretCounts = new Map<Color, number>();

  for (let i = 0; i < secret.length; i++) {
    const g = guess[i];
    const s = secret[i];
    if (g === s) {
      exact++;
      continue;
    }
    if (g !== 'off') guessCounts.set(g, (guessCounts.get(g) ?? 0) + 1);
    secretCounts.set(s, (secretCounts.get(s) ?? 0) + 1);
  }

  let colorOnly = 0;
  for (const [color, gc] of guessCounts) {
    colorOnly += Math.min(gc, secretCounts.get(color) ?? 0);
  }

  return { exact, colorOnly };
}

/**
 * Run a check: record feedback, consume a check, and update status.
 * Wins on a fully exact guess; after MAX_CHECKS without a win the round is
 * lost. The secret is NOT auto-regenerated here — call `reset` to start the
 * next round so the presentation layer can show the result first.
 */
export function check(state: GameState): CheckRecord {
  if (state.status !== 'playing') {
    throw new Error(`cannot check while status is "${state.status}"`);
  }

  const feedback = computeFeedback(state.guess, state.secret);
  const record: CheckRecord = { ...feedback, guess: [...state.guess] };
  state.history.push(record);
  state.checksUsed++;

  if (feedback.exact === CODE_LENGTH) {
    state.status = 'won';
  } else if (state.checksUsed >= MAX_CHECKS) {
    state.status = 'lost';
  }

  return record;
}

/** Begin a new round in place: new secret, cleared guess/history. */
export function reset(state: GameState, rng: Rng = Math.random): GameState {
  const fresh = newGame(rng);
  (state as { secret: Color[] }).secret = fresh.secret;
  state.guess = fresh.guess;
  state.history = [];
  state.checksUsed = 0;
  state.status = 'playing';
  return state;
}
