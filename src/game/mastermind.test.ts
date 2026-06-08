import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH,
  LIGHT_CYCLE,
  MAX_CHECKS,
  check,
  computeFeedback,
  cycleLight,
  generateSecret,
  newGame,
  reset,
  type Color,
  type GameState,
  type LightState,
} from './mastermind';

/** Deterministic RNG that yields the given values in sequence, then repeats. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('computeFeedback', () => {
  const secret: Color[] = ['red', 'green', 'blue', 'white', 'magenta'];

  it('counts all exact for an identical guess', () => {
    expect(computeFeedback([...secret], secret)).toEqual({ exact: 5, colorOnly: 0 });
  });

  it('counts zero for a guess with no shared colors', () => {
    const guess: LightState[] = ['cyan', 'cyan', 'cyan', 'cyan', 'cyan'];
    expect(computeFeedback(guess, ['red', 'green', 'blue', 'white', 'magenta'])).toEqual({
      exact: 0,
      colorOnly: 0,
    });
  });

  it('counts color-only when all correct colors are misplaced', () => {
    // A rotation of the secret: every color present, none in place.
    const guess: LightState[] = ['magenta', 'red', 'green', 'blue', 'white'];
    expect(computeFeedback(guess, secret)).toEqual({ exact: 0, colorOnly: 5 });
  });

  it('treats off lights as matching nothing', () => {
    const guess: LightState[] = ['red', 'off', 'off', 'off', 'off'];
    expect(computeFeedback(guess, secret)).toEqual({ exact: 1, colorOnly: 0 });
  });

  it('never double-counts a peg as both exact and color-only', () => {
    const dupSecret: Color[] = ['red', 'red', 'blue', 'blue', 'green'];
    // One red exact (pos 0), one extra red in guess maps to the other secret
    // red (color-only), surplus reds beyond secret count are ignored.
    const guess: LightState[] = ['red', 'green', 'red', 'red', 'red'];
    const fb = computeFeedback(guess, dupSecret);
    expect(fb.exact).toBe(1); // pos 0 red
    expect(fb.colorOnly).toBe(2); // one more red + the misplaced green
  });

  it('respects per-color min counts with repeats', () => {
    expect(computeFeedback(['red', 'red', 'red', 'off', 'off'], ['red', 'green', 'green', 'green', 'green'])).toEqual({
      exact: 1,
      colorOnly: 0,
    });
  });
});

describe('cycleLight', () => {
  it('advances through the full cycle and wraps to off', () => {
    const state = newGame(seqRng([0]));
    const seen: LightState[] = [state.guess[0]];
    for (let i = 0; i < LIGHT_CYCLE.length; i++) {
      cycleLight(state, 0);
      seen.push(state.guess[0]);
    }
    expect(seen).toEqual([...LIGHT_CYCLE, 'off']);
  });

  it('throws for an out-of-range index', () => {
    const state = newGame(seqRng([0]));
    expect(() => cycleLight(state, CODE_LENGTH)).toThrow(RangeError);
  });
});

describe('generateSecret', () => {
  it('produces a code of valid colors only', () => {
    const secret = generateSecret(seqRng([0, 0.2, 0.4, 0.6, 0.99]));
    expect(secret).toHaveLength(CODE_LENGTH);
    expect(secret).toEqual(['red', 'green', 'blue', 'white', 'cyan']);
  });
});

describe('check & round flow', () => {
  function setGuess(state: GameState, colors: LightState[]): void {
    state.guess = [...colors];
  }

  it('wins on a fully exact guess', () => {
    const state = newGame(seqRng([0])); // secret all red
    setGuess(state, ['red', 'red', 'red', 'red', 'red']);
    const record = check(state);
    expect(record.exact).toBe(5);
    expect(state.status).toBe('won');
    expect(state.history).toHaveLength(1);
  });

  it('snapshots the guess in history', () => {
    const state = newGame(seqRng([0]));
    setGuess(state, ['green', 'off', 'off', 'off', 'off']);
    check(state);
    setGuess(state, ['blue', 'off', 'off', 'off', 'off']);
    expect(state.history[0].guess[0]).toBe('green');
  });

  it('loses after MAX_CHECKS without a win', () => {
    const state = newGame(seqRng([0])); // secret all red
    setGuess(state, ['green', 'green', 'green', 'green', 'green']);
    for (let i = 0; i < MAX_CHECKS; i++) {
      expect(state.status).toBe('playing');
      check(state);
    }
    expect(state.checksUsed).toBe(MAX_CHECKS);
    expect(state.status).toBe('lost');
  });

  it('refuses to check once the round is over', () => {
    const state = newGame(seqRng([0]));
    setGuess(state, ['red', 'red', 'red', 'red', 'red']);
    check(state);
    expect(() => check(state)).toThrow();
  });
});

describe('reset', () => {
  it('starts a fresh round in place', () => {
    const state = newGame(seqRng([0]));
    state.guess = ['red', 'green', 'blue', 'white', 'magenta'];
    check(state);
    reset(state, seqRng([0.99]));
    expect(state.status).toBe('playing');
    expect(state.checksUsed).toBe(0);
    expect(state.history).toHaveLength(0);
    expect(state.guess).toEqual(['off', 'off', 'off', 'off', 'off']);
    expect(state.secret).toEqual(['cyan', 'cyan', 'cyan', 'cyan', 'cyan']);
  });
});
