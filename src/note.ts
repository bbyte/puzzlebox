/**
 * Note text obfuscation + the on-screen "unfolded paper" overlay.
 *
 * The text is XOR'd with a fixed key and base64-encoded so it isn't sitting in
 * the source as clear text. This is obfuscation, NOT security — anyone can
 * decode it; it just keeps the message out of plain view / search.
 */
const KEY = 'puzzlebox';

function xorBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length);
  return out;
}

/** Encode plain text → obfuscated string (dev helper; see scripts/encode-note). */
export function encodeNote(text: string): string {
  const xored = xorBytes(new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...xored));
}

/** Decode an obfuscated string back to the original text. */
export function decodeNote(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(xorBytes(bytes));
}

export interface NoteOverlay {
  show(text: string): void;
  hide(): void;
  get visible(): boolean;
}

/**
 * Build a modal overlay that shows the note as an aged, folded-then-unfolding
 * sheet of paper. Tap the backdrop (outside the paper) to dismiss.
 */
export function createNoteOverlay(onClose: () => void): NoteOverlay {
  const backdrop = document.createElement('div');
  backdrop.className = 'note-backdrop';

  const paper = document.createElement('div');
  paper.className = 'note-paper';

  const text = document.createElement('p');
  text.className = 'note-text';
  paper.appendChild(text);

  // Fold flaps: start folded over the middle band, then swing open on show.
  const foldTop = document.createElement('div');
  foldTop.className = 'note-fold top';
  const foldBottom = document.createElement('div');
  foldBottom.className = 'note-fold bottom';
  paper.append(foldTop, foldBottom);

  backdrop.appendChild(paper);
  document.body.appendChild(backdrop);

  let isVisible = false;

  function hide(): void {
    if (!isVisible) return;
    isVisible = false;
    backdrop.classList.remove('visible');
    onClose();
  }

  // Tap outside the paper closes; tapping the paper itself does not.
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) hide();
  });

  return {
    show(content: string) {
      text.textContent = content;
      isVisible = true;
      // next frame so the unfold transition runs from the collapsed state
      requestAnimationFrame(() => backdrop.classList.add('visible'));
    },
    hide,
    get visible() {
      return isVisible;
    },
  };
}
