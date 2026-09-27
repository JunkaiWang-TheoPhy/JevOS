import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); }
const [major, minor] = process.versions.node.split('.').map(Number);
check('Node.js', major > 22 || (major === 22 && minor >= 12), process.version);
for (const name of ['react', 'vite', 'typescript', 'vite-plugin-pwa', '@json-render/core', '@json-render/react', '@playwright/test']) {
  try { require.resolve(name); check(name, true, pkg.dependencies?.[name] || pkg.devDependencies?.[name] || 'installed'); }
  catch { check(name, false, 'run npm ci'); }
}
const core = await import('@json-render/core');
check('Jev composition API', typeof core.experimental_composeSpec === 'function' &&
  typeof core.experimental_createEvaluator === 'function', 'published experimental exports available');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
check('Browser smoke tests', existsSync(chrome) || existsSync(chromium.executablePath()),
  existsSync(chrome) ? 'installed Google Chrome; isolated test profile' : 'Playwright Chromium (install with npx playwright install chromium if missing)');
check('PWA icons', ['pwa-192', 'pwa-512', 'maskable-512', 'apple-touch-icon'].every(name =>
  existsSync(new URL(`../public/icons/${name}.png`, import.meta.url))), 'PNG assets present');
for (const item of checks) console.log(`${item.ok ? 'OK' : 'FAIL'} ${item.name}: ${item.detail}`);
console.log(existsSync(new URL('../.env.local', import.meta.url))
  ? 'Local env file present (contents not displayed)' : 'Optional: copy .env.example to .env.local for server-side Jev configuration');
console.log('Dev: npm run dev → localhost:5173; Production PWA: npm run build && npm run preview → localhost:4173');
if (checks.some(item => !item.ok)) process.exitCode = 1;
