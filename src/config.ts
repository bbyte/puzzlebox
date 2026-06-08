/**
 * App configuration.
 *
 * Note: this all ships to the client (it's a static app), so nothing here is
 * truly secret. Obfuscated values (XOR + base64) only keep things out of plain
 * "view source" sight — they are not security. The `debug` block is for
 * development; turn it off before sharing the puzzle for real.
 */
export const CONFIG = {
  debug: {
    /**
     * Master code: when enabled, entering this exact code on the lights and
     * pressing Check always opens the box, regardless of the real secret.
     * Handy for testing the open animation without solving the puzzle.
     *
     * `encoded` is the comma-joined color names, obfuscated so the cheat code
     * isn't clear text in the source. Regenerate with `obfuscate('a,b,c,d,e')`
     * from src/obfuscate.ts. Set `enabled: false` to disable entirely.
     */
    masterCode: {
      enabled: true,
      encoded: 'AhAeVgsXBwoWXBcWDwlJFQcRBBBWFw0CBwEMEQ==',
    },
    /**
     * Log the freshly generated secret to the console each round. Leave this
     * OFF when sharing — it reveals the answer to anyone with devtools open.
     */
    revealSecret: false,
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
