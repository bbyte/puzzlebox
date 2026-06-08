/**
 * The on-screen "unfolded paper" overlay. The note text is obfuscated (see
 * `src/obfuscate.ts`) so it isn't clear text in the source.
 */
import { obfuscate, deobfuscate } from './obfuscate';

/** Encode plain text → obfuscated string (use this to set CONFIG.note.encoded). */
export const encodeNote = obfuscate;

/** Decode an obfuscated note string back to the original text. */
export const decodeNote = deobfuscate;

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
