import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { updateTracker } from './tracker.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = join(project, 'demo-output');
await mkdir(join(root, 'config'), { recursive: true });
await copyFile(join(project, 'config/tools.json'), join(root, 'config/tools.json'));
await updateTracker({
  root,
  fetchImpl: async url => {
    const repo = new URL(url).pathname.split('/').slice(2, 4).join('/');
    return new Response(JSON.stringify({
      tag_name: 'v0.0.0-DEMO', name: 'Offline demonstration',
      published_at: '2026-01-01T00:00:00Z',
      html_url: `https://github.com/${repo}/releases`,
      body: 'DEMO DATA: simulated release, not a real upstream version.',
      draft: false, prerelease: false
    }), { status: 200 });
  }
});
console.log('Offline demo ready: demo-output/reports/latest.md (simulated data).');
