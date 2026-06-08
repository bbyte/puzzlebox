import type { Color, LightState } from '../game/mastermind';

/**
 * Real box dimensions in millimetres, modelled 1 unit = 1 metre.
 * Width 145mm (x) × Height 100mm (y) × Depth 110mm (z).
 */
export const BOX = {
  width: 0.145,
  height: 0.1,
  depth: 0.11,
} as const;

/** Emissive RGB for each light color. `off` is a dim, unlit grey. */
export const LIGHT_HEX: Record<LightState, number> = {
  off: 0x14151a,
  red: 0xff2a2a,
  green: 0x2aff4a,
  blue: 0x2a6bff,
  white: 0xffffff,
  magenta: 0xff2adf,
  cyan: 0x2afff0,
};

export function colorHex(c: Color): number {
  return LIGHT_HEX[c];
}
