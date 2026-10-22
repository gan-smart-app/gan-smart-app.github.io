import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// public/gan-v15 is served byte-for-byte (unchanged v15 connection files).
export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  test: undefined,
});
