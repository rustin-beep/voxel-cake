import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// Inlines the static cake illustration into index.html at build time so the
// no-WebGL fallback exists even before a single line of JS has run.
function inlineSvgFallback() {
  return {
    name: 'inline-svg-fallback',
    transformIndexHtml(html) {
      const file = path.resolve(process.cwd(), 'src/fallback-cake.svg');
      let svg = fs.readFileSync(file, 'utf8');
      svg = svg.replace(/<\?xml[^>]*\?>\s*/, '');
      // strip the outer width/height so CSS can size it
      svg = svg.replace(/<svg([^>]*?)\swidth="100%"\sheight="100%"/, '<svg$1');
      return html.replace('<!--FALLBACK_SVG-->', svg);
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [
      inlineSvgFallback(),
      ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],
    build: {
      target: 'es2020',
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      assetsInlineLimit: 100 * 1024 * 1024,
      cssCodeSplit: false,
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
    server: { host: '127.0.0.1', port: 5173 },
  };
});
