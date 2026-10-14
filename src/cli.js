import { fileURLToPath } from 'node:url';
import { appendFile } from 'node:fs/promises';
import { updateTracker } from './tracker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const result = await updateTracker({ root, token: process.env.GITHUB_TOKEN || '' });
  const message = result.changed
    ? `Updated reports for ${result.tools} tools.`
    : `Checked ${result.tools} tools: no content changes, no commit needed.`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Release tracker\n\n${message}\n`);
  }
} catch (error) {
  console.error(`Tracker failed: ${error.message}`);
  process.exitCode = 1;
}
