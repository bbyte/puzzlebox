import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Client-only static app.
// - dev/preview servers bind 0.0.0.0 so other devices (phones) on the LAN can
//   reach them via this machine's IP.
// - viteSingleFile inlines all JS/CSS into one dist/index.html, so the build
//   can be opened directly from the filesystem (file://) — no server needed.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    host: true, // 0.0.0.0
    port: 5173,
  },
  preview: {
    host: true, // 0.0.0.0
    port: 4173,
  },
  build: {
    target: 'es2022',
  },
});
