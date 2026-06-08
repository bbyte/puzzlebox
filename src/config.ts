import type { Color } from './game/mastermind';

/**
 * App configuration. The `debug` block is for development only — flip
 * `masterCode.enabled` off before shipping.
 */
export const CONFIG = {
  debug: {
    /**
     * Master code: when enabled, entering this exact code on the lights and
     * pressing Check always opens the box, regardless of the real secret.
     * Handy for testing the open animation without solving the puzzle.
     */
    masterCode: {
      enabled: true,
      code: ['red', 'green', 'blue', 'white', 'magenta'] as Color[],
    },
    /** Log the freshly generated secret to the console each round. */
    revealSecret: true,
  },

  note: {
    /**
     * The hidden note's message, obfuscated (XOR + base64) so it isn't clear
     * text in the source. To change it, run in a browser console (or a tiny
     * script) `encodeNote('your new text')` from src/note.ts and paste the
     * result here.
     */
    encoded:
      'oOWqy7zQQr/FoMBaq+212k+oy6XCWrzas++oxaXAqty12b/NoMiqxEy10b/GoM6r9bzZst9YoMeqz73istpYoMGqyky047/AUKXCqt+04r/IoMCr8ky040+oz6Twqtu117/DofKqz73nst9HUUpb',
  },
} as const;
