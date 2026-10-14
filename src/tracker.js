import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export function validateTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > 30) {
    throw new Error('Configure between 1 and 30 tools.');
  }

  const seen = new Set();

  return tools.map(tool => {
    if (
      !tool ||
      typeof tool.name !== 'string' ||
      !tool.name.trim() ||
      tool.name.length > 100 ||
      typeof tool.repo !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(tool.repo)
    ) {
      throw new Error(
        'Each tool needs a name and a GitHub owner/repo (no URL).'
      );
    }

    const key = tool.repo.toLowerCase();

    if (seen.has(key)) {
      throw new Error(`Duplicate repository: ${tool.repo}`);
    }

    seen.add(key);

    return {
      name: tool.name.trim(),
      repo: tool.repo
    };
  });
}

export async function requestGitHub(
  path,
  {
    fetchImpl = globalThis.fetch,
    token = '',
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  } = {}
) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'devtools-release-tracker'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    let response;

    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        headers,
        signal: AbortSignal.timeout(15000),
        redirect: 'follow'
      });
    } catch {
      if (attempt === 2) {
        throw new Error(`Network request failed: ${path}`);
      }

      await sleep(500 * (attempt + 1));
      continue;
    }

    if (response.status >= 500 && attempt < 2) {
      await sleep(500 * (attempt + 1));
      continue;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const hint = [403, 429].includes(response.status)
        ? ' Check token permissions or wait for the API rate limit to reset.'
        : '';

      throw new Error(
        `GitHub API HTTP ${response.status}: ${path}.${hint}`
      );
    }

    return response.json();
  }
}

export async function fetchRelease(tool, options) {
  const base = `/repos/${tool.repo}`;

  const release = await requestGitHub(
    `${base}/releases/latest`,
    options
  );

  if (release === null) {
    // Distinguish a repository without releases from an invalid repository.
    const repo = await requestGitHub(base, options);

    if (!repo || typeof repo.full_name !== 'string') {
      throw new Error(
        `Repository not found or inaccessible: ${tool.repo}`
      );
    }

    return {
      ...tool,
      release: null
    };
  }

  if (
    typeof release.tag_name !== 'string' ||
    !release.tag_name ||
    typeof release.html_url !== 'string' ||
    !release.html_url.startsWith('https://github.com/') ||
    typeof release.published_at !== 'string' ||
    Number.isNaN(Date.parse(release.published_at)) ||
    release.draft !== false ||
    release.prerelease !== false ||
    (release.body != null && typeof release.body !== 'string')
  ) {
    throw new Error(`Unexpected release response for ${tool.repo}`);
  }

  return {
    ...tool,
    release: {
      tag: release.tag_name,
      title: release.name || release.tag_name,
      publishedAt: release.published_at,
      url: release.html_url,
      notes: (release.body || '').trim().slice(0, 180)
    }
  };
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&')
    .replace(/\r?\n/g, ' ');
}

export function renderReport(state) {
  const lines = [
    '# DevTools Release Tracker',
    '',
    'Latest full releases returned by GitHub. Drafts and prereleases are excluded.',
    'This report changes only when tracked content changes. See Actions for check times.',
    '',
    '| Tool | Repository | Release | Published (UTC) |',
    '| --- | --- | --- | --- |'
  ];

  for (const tool of state.tools) {
    const release = tool.release;

    const link = release
      ? `[${escapeText(release.tag)}](${encodeURI(release.url)
          .replace(/\(/g, '%28')
          .replace(/\)/g, '%29')})`
      : 'No full release';

    lines.push(
      `| ${escapeText(tool.name)} | [${escapeText(tool.repo)}](https://github.com/${tool.repo}) | ${link} | ${release ? release.publishedAt.slice(0, 10) : '—'} |`
    );
  }

  lines.push(
    '',
    '## Release note excerpts',
    '',
    'Excerpts are attributed to each linked upstream project. Follow the link for full notes.',
    ''
  );

  for (const tool of state.tools) {
    lines.push(`### ${escapeText(tool.name)}`, '');

    lines.push(
      tool.release
        ? escapeText(tool.release.notes || 'No release notes provided.')
        : 'No published full release found.',
      ''
    );
  }

  return lines.join('\n') + '\n';
}

async function readIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function updateTracker(
  { root, fetchImpl, token = '', sleep } = {}
) {
  if (!root) {
    throw new Error('A project root is required.');
  }

  const tools = validateTools(
    JSON.parse(
      await readFile(join(root, 'config/tools.json'), 'utf8')
    )
  );

  const entries = [];

  // Fetch everything before writing to preserve reports on API failure.
  for (const tool of tools) {
    entries.push(
      await fetchRelease(tool, { fetchImpl, token, sleep })
    );
  }

  const state = {
    schemaVersion: 1,
    tools: entries
  };

  const output = join(root, 'reports');

  const files = [
    ['releases.json', JSON.stringify(state, null, 2) + '\n'],
    ['latest.md', renderReport(state)]
  ];

  const pending = [];

  for (const [name, content] of files) {
    if (await readIfExists(join(output, name)) !== content) {
      pending.push([name, content]);
    }
  }

  if (pending.length) {
    await mkdir(output, { recursive: true });

    for (const [name, content] of pending) {
      await writeFile(join(output, name + '.tmp'), content);
    }

    for (const [name] of pending) {
      await rename(
        join(output, name + '.tmp'),
        join(output, name)
      );
    }
  }

  return {
    changed: pending.length > 0,
    tools: entries.length,
    state
  };
}
