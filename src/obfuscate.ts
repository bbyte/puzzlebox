/**
 * Lightweight string obfuscation (XOR with a fixed key + base64).
 *
 * This keeps values out of plain view / source search — it is NOT security.
 * Everything ships to the client, so anyone determined can decode it; this
 * only stops casual "view source" snooping.
 */
const KEY = 'puzzlebox';

function xorBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length);
  return out;
}

/** Encode plain text → obfuscated string. */
export function obfuscate(text: string): string {
  const xored = xorBytes(new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...xored));
}

/** Decode an obfuscated string back to the original text. */
export function deobfuscate(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(xorBytes(bytes));
}
