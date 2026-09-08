import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { buildImages } from './build-images.ts'

rmSync('dist/assets', { recursive: true, force: true })
mkdirSync('dist/assets', { recursive: true })
cpSync('public', 'dist/assets', { recursive: true })
await buildImages('dist/assets')
mkdirSync('dist/assets/maps', { recursive: true })
cpSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'dist/assets/maps/maplibre.css')
await build({
  entryPoints: {
    entry: 'app/actions/public/entry.ts',
    analytics: 'app/actions/public/analytics.ts',
    workspace: 'app/actions/public/workspace.tsx',
    'example-flow': 'app/actions/public/example-flow.tsx',
    'route-map': 'app/ui/public/route-map.tsx',
    'maplibre-worker': 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
    'upload-form': 'app/actions/stitches/public/upload-form.tsx',
  },
  outdir: 'dist/assets/client',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'undefined' },
  jsx: 'automatic',
  jsxImportSource: 'remix/ui',
})
writeFileSync(
  'dist/assets/_headers',
  '/client/*\n  Content-Type: application/javascript; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n',
)
console.log('Browser assets prepared for Cloudflare.')
