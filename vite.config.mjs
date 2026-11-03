import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [{
    name: 'portable-file-entry',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const document = bundle['index.html'];
      if (!document || document.type !== 'asset') throw new Error('Missing viewer HTML entry.');
      // Classic scripts and relative stylesheets can load directly from file URLs.
      document.source = String(document.source)
        .replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, '<script defer src="$1"></script>')
        .replace(/(<link\b[^>]*?)\s+crossorigin(?:="[^"]*")?/g, '$1');
    },
  }],
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', name: 'EvoClass', inlineDynamicImports: true } },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
