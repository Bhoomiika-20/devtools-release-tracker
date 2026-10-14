# DevTools Release Tracker

A small JavaScript automation project that checks public GitHub repositories for their latest full releases and maintains a readable Markdown report. GitHub Actions checks daily and commits only when report content changes.

**Level:** beginner to intermediate. **Stack:** Node.js 24+, JavaScript, GitHub REST API, GitHub Actions, JSON and Markdown. No database, paid API, Express server or frontend is needed for this version. There are no npm dependencies to install.

## What it does

1. Read the tracked tools from `config/tools.json`.
2. Ask GitHub's `/repos/{owner}/{repo}/releases/latest` API for each tool.
3. Keep the version, release date, link and a short attributed release-note excerpt.
4. Compare the generated JSON and Markdown with the previous files.
5. Write changed reports. In Actions, commit and push only those two files.

Defaults: Node.js, React, Vite, TypeScript and VS Code. The latest full release is the one GitHub returns, not necessarily the numerically highest version, every release in a day, or the latest npm package. Drafts and prereleases are excluded.

Open **[reports/latest.md](reports/latest.md)** after the first successful live check. For check timestamps and failures, open the repository's **Actions** tab. No timestamps are added to reports solely to produce commits.

## Quick local run

Install Node.js 24 or newer. Extract the ZIP into a new folder, open the `devtools-release-tracker` folder in VS Code, and open its terminal:

```powershell
node --version
npm test
npm run demo
npm run track
```

- `npm test`: network-free correctness tests.
- `npm run demo`: simulated releases, clearly labeled, saved in ignored `demo-output/reports/latest.md`.
- `npm run track`: real GitHub API requests; updates `reports/latest.md` and `reports/releases.json`.

You can run `npm run track` from any terminal directory using `npm --prefix PATH_TO_PROJECT run track`. The script resolves files relative to its own project, not your terminal's current folder. Local commands do not commit or push anything.

For the GitHub setup and author identity, read **[START_HERE.md](START_HERE.md)**.

## Files worth learning

| File | Purpose |
| --- | --- |
| `config/tools.json` | Your tool names and GitHub owner/repo paths |
| `src/tracker.js` | Validation, API calls, report rendering and change detection |
| `src/cli.js` | Run the tracker and return a failing exit code on errors |
| `src/demo.js` | Offline demonstration with simulated data |
| `.github/workflows/track-releases.yml` | Daily schedule and report-only auto-commit/push |
| `.github/workflows/test.yml` | Read-only tests on pushes and pull requests |
| `test/tracker.test.js` | Failure preservation, retries, idempotence and other checks |
| `reports/latest.md` | Human-readable report |
| `reports/releases.json` | Machine-readable snapshot |

## Change the tools

Edit `config/tools.json`, preserving valid JSON:

```json
[
  { "name": "React", "repo": "facebook/react" },
  { "name": "Express", "repo": "expressjs/express" }
]
```

Use public repositories and an `owner/repo` path, not a full URL. Up to 30 tools are supported. Duplicate repositories are rejected. Existing public repositories without a full release appear as "No full release"; missing repositories cause a failed run. Renamed repositories may need their new path because redirects are intentionally rejected.

## Reliability and scope

- Fetches all tools before modifying reports. An API failure leaves previous reports intact.
- Retries network errors and 5xx responses up to three total attempts, with 15-second request timeouts.
- Fails promptly on auth/rate-limit errors; rerun later rather than repeatedly requesting.
- Compares actual content, so unchanged checks produce no commit.
- Stages each file through a temporary file and atomic rename. A filesystem failure between renames could leave local reports inconsistent; a subsequent successful run repairs them. Actions never commits when the tracker exits unsuccessfully.
- Stages only `reports/latest.md` and `reports/releases.json` for automated commits.
- Uses a repository-scoped `GITHUB_TOKEN`; no broad personal access token is required.
- Default branch only, with workflow concurrency and no force push. A simultaneous manual push may cause a safe failure; rerun.
- Does not install or update tracked tools on your laptop or in other projects.
- Stores the current snapshot; past snapshots remain in Git history. It does not archive every release.

## What to study for an interview

Start with `fetch`, async/await, HTTP status codes, JSON, filesystem reads/writes, Git commits, cron and GitHub Actions permissions. Then study why identical runs do not create commits, how retries are bounded, and why failed fetches preserve the last good report.

A description you can use once you've run and understood it:

> Built a developer-tool release tracker using JavaScript, GitHub REST API and GitHub Actions; automated daily checks and report updates with content-based change detection, bounded retries and report-only commits.

## Official references

- [GitHub release API](https://docs.github.com/en/rest/releases/releases)
- [Scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Repository-scoped GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)
- [Contribution rules](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference)

Upstream release-note excerpts remain attributable to their linked projects and subject to their respective terms.
