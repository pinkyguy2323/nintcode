import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri dev server must run on a fixed port.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
