import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ plugins: [svelte()], worker: { format: 'es' },
  build: { outDir: '../.scratch/monaco-readonly', emptyOutDir: true, rollupOptions: { input: 'editor-spike.html' } },
  server: { host: '127.0.0.1', port: 4902, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4900' } },
  preview: { host: '127.0.0.1', port: 4902, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4900' } },
});
