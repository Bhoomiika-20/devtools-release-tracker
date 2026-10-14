import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateTools, requestGitHub, fetchRelease, updateTracker, renderReport } from '../src/tracker.js';

const tool = { name: 'Example Tool', repo: 'example/tool' };
function release(overrides = {}) {
  return { tag_name: 'v1.0.0', name: 'Release 1', published_at: '2026-01-01T00:00:00Z',
    html_url: 'https://github.com/example/tool/releases/tag/v1.0.0',
    body: 'Improved performance.', draft: false, prerelease: false, ...overrides };
}
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
async function fixture(t, tools = [tool]) {
  const root = await mkdtemp(join(tmpdir(), 'release-tracker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'config'));
  await writeFile(join(root, 'config/tools.json'), JSON.stringify(tools));
  return root;
}

test('first fetch writes reports; identical second fetch writes nothing', async t => {
  const root = await fixture(t);
  const fetchImpl = async () => reply(release());
  assert.equal((await updateTracker({ root, fetchImpl })).changed, true);
  const before = await readFile(join(root, 'reports/releases.json'), 'utf8');
  assert.equal((await updateTracker({ root, fetchImpl })).changed, false);
  assert.equal(await readFile(join(root, 'reports/releases.json'), 'utf8'), before);
  assert.match(await readFile(join(root, 'reports/latest.md'), 'utf8'), /v1/);
});

test('new version and amended notes are each detected', async t => {
  const root = await fixture(t);
  await updateTracker({ root, fetchImpl: async () => reply(release()) });
  assert.equal((await updateTracker({ root, fetchImpl: async () => reply(release({ tag_name: 'v2.0.0' })) })).changed, true);
  assert.equal((await updateTracker({ root, fetchImpl: async () => reply(release({ tag_name: 'v2.0.0', body: 'Fixed an issue.' })) })).changed, true);
});

test('one failed tool preserves both existing reports despite earlier successful fetches', async t => {
  const root = await fixture(t, [tool, { name: 'Other', repo: 'example/other' }]);
  await updateTracker({ root, fetchImpl: async () => reply(release()) });
  const before = await Promise.all(['latest.md', 'releases.json'].map(name => readFile(join(root, 'reports', name), 'utf8')));
  await assert.rejects(updateTracker({ root, fetchImpl: async url =>
    url.includes('/other/') ? reply({}, 403) : reply(release({ tag_name: 'v2' })) }), /HTTP 403/);
  const after = await Promise.all(['latest.md', 'releases.json'].map(name => readFile(join(root, 'reports', name), 'utf8')));
  assert.deepEqual(after, before);
});

test('missing release on an existing repository is a valid empty result', async () => {
  const result = await fetchRelease(tool, { fetchImpl: async url =>
    url.endsWith('/latest') ? reply({}, 404) : reply({ full_name: tool.repo }) });
  assert.equal(result.release, null);
});

test('an incorrect or inaccessible repository is an error, not no-release', async () => {
  await assert.rejects(fetchRelease(tool, { fetchImpl: async () => reply({}, 404) }), /not found/);
});

test('transient server errors are retried with a bounded delay', async () => {
  let attempts = 0;
  const waits = [];
  const result = await requestGitHub('/repos/example/tool', {
    fetchImpl: async () => ++attempts < 3 ? reply({}, 503) : reply({ ok: true }),
    sleep: async delay => waits.push(delay)
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test('persistent network failure stops after three attempts without exposing the token', async () => {
  let attempts = 0;
  await assert.rejects(requestGitHub('/repos/example/tool', {
    token: 'private-token', sleep: async () => {},
    fetchImpl: async () => { attempts++; throw new Error('private-token'); }
  }), error => error.message.includes('Network request failed') && !error.message.includes('private-token'));
  assert.equal(attempts, 3);
});

test('rate limit errors fail promptly without retry storms', async () => {
  let attempts = 0;
  await assert.rejects(requestGitHub('/repos/example/tool', {
    fetchImpl: async () => { attempts++; return reply({}, 429); }
  }), /rate limit/);
  assert.equal(attempts, 1);
});

test('malformed JSON and unexpected release fields are rejected', async () => {
  await assert.rejects(fetchRelease(tool, { fetchImpl: async () => new Response('invalid JSON') }));
  await assert.rejects(fetchRelease(tool, { fetchImpl: async () => reply(release({ tag_name: null })) }), /Unexpected/);
  await assert.rejects(fetchRelease(tool, { fetchImpl: async () => reply(release({ prerelease: true })) }), /Unexpected/);
});

test('configuration rejects duplicates, empty tools, and non-GitHub paths', () => {
  assert.throws(() => validateTools([]));
  assert.throws(() => validateTools([tool, { ...tool, repo: 'EXAMPLE/TOOL' }]), /Duplicate/);
  assert.throws(() => validateTools([{ name: 'Bad', repo: '../../somewhere' }]));
  assert.throws(() => validateTools([{ name: 'Bad', repo: 'https://github.com/example/tool' }]));
  assert.deepEqual(validateTools([tool]), [tool]);
});

test('removing a configured tool removes it from the report', async t => {
  const root = await fixture(t, [tool, { name: 'Other', repo: 'example/other' }]);
  await updateTracker({ root, fetchImpl: async () => reply(release()) });
  await writeFile(join(root, 'config/tools.json'), JSON.stringify([tool]));
  const result = await updateTracker({ root, fetchImpl: async () => reply(release()) });
  assert.equal(result.changed, true);
  assert.equal(result.state.tools.length, 1);
});

test('upstream Markdown and HTML cannot inject report headings or table rows', () => {
  const output = renderReport({ tools: [{ name: 'Example | Tool', repo: tool.repo,
    release: { tag: 'v1', publishedAt: '2026-01-01T00:00:00Z', url: 'https://github.com/example/tool',
      notes: '<script>alert(1)</script>\n# Spoofed heading' } }] });
  assert.ok(!output.includes('<script>'));
  assert.ok(!output.includes('\n# Spoofed'));
  assert.ok(output.includes('Example \\| Tool'));
});

test('missing auth stays anonymous and API requests use the expected host', async () => {
  await requestGitHub('/repos/example/tool', {
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).hostname, 'api.github.com');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'follow');
      return reply({});
    }
  });
});