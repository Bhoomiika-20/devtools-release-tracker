# Start here — Hinglish setup

## 1. Alag folder aur alag repo

ZIP extract karo. `devtools-release-tracker` folder VS Code mein open karo. Isko kisi existing project ke andar mat rakho.

GitHub par apne account mein **New repository** banao:

- Name: `devtools-release-tracker`
- New standalone repository, fork nahi.
- Public is the simplest option for this report project. Private repositories may consume your plan's Actions allowance; check GitHub billing before enabling paid usage.
- "Add a README", license aur `.gitignore` options initially unchecked rakho, kyunki files yahan already hain.

## 2. Local check

Node.js 24+ install hona chahiye. VS Code terminal mein:

```powershell
node --version
npm test
npm run demo
```

Demo dekhne ke liye `demo-output/reports/latest.md` VS Code mein open karo; Ctrl+Shift+V se Markdown preview. Demo data real releases nahi hai aur GitHub par push nahi hota.

Real report ke liye:

```powershell
npm run track
```

Ismein internet chahiye. Anonymous requests rate-limited ho sakti hain. Agar local run fail ho toh Actions par built-in token ke saath run kar sakti ho; personal token banana zaroori nahi.

## 3. First push

Terminal isi naye project folder mein hona chahiye. Neeche placeholders replace karo. Email GitHub Settings → Emails mein jo linked email ya exact GitHub-provided no-reply address hai wahi use karo; no-reply address guess mat karna.

```powershell
git init -b main
git config --local user.name "YOUR_NAME"
git config --local user.email "YOUR_GITHUB_LINKED_EMAIL"
git add .
git commit -m "feat: add developer tool release tracker"
git remote add origin https://github.com/YOUR_USERNAME/devtools-release-tracker.git
git push -u origin main
```

GitHub sign-in maange toh normal Git credential login complete karo. Passwords/tokens code files mein paste mat karo. Yeh commands isi folder ka repo banati hain aur `--local` config doosre repos ki identity change nahi karti.

## 4. Automated commit tumhare naam se

Repository → Settings → Secrets and variables → Actions → **Variables** → New repository variable:

| Variable | Value |
| --- | --- |
| `COMMIT_AUTHOR_NAME` | Your name, e.g. Bhoomika Sharma |
| `COMMIT_AUTHOR_EMAIL` | Exact GitHub-linked email or GitHub-provided no-reply email |

Dono set karo. Email secret/token nahi hai; commit metadata mein visible hota hai, isliye privacy ke liye GitHub-provided no-reply email choose kar sakti ho.

Dono blank chhodogi toh automation bot ke naam se commit karega, tumhare author identity se nahi. Sirf ek variable set karogi toh workflow clear error ke saath stop hoga.

## 5. Run now

Repository → Actions → **Track releases** → **Run workflow** → default branch (usually `main`) → Run workflow.

Successful run ke baad Code → `reports/latest.md` open karo. Already same live report committed hai toh workflow successful hoga lekin naya commit nahi banega. Yeh expected behavior hai.

Default schedule daily **08:47 IST (03:17 UTC)** hai. Laptop band ho tab bhi GitHub par chalega. Scheduled jobs delay/drop ho sakte hain; exact time ya daily contribution guaranteed nahi. Public repo mein 60 days inactivity par scheduled workflow disable ho sakta hai; Actions tab se re-enable karo.

## 6. Common errors

| Error / behavior | Kya karna hai |
| --- | --- |
| `npm` not recognized | Node.js install karke VS Code reopen karo |
| Repository not found / inaccessible | `config/tools.json` mein exact current public owner/repo check karo |
| HTTP 403 / 429 | Permissions/rate limit check karo, phir later rerun |
| Push denied / HTTP 403 on git push | Repository Settings → Actions → General → Workflow permissions mein writes allowed hain ya nahi check karo; organization policy may block them |
| Protected branch rejects push | Is separate report repo mein direct report pushes allow karo, ya future version mein PR-based updates use karo; protection bypass nahi hoti |
| Push rejected because branch changed | Latest code pull karo if needed, then workflow rerun; force push mat karo |
| Manual run skipped | Default branch select karo; other branches par writing disabled hai |
| No commit created | Report unchanged hai; yeh correct hai |
| Green square missing | Linked author email, standalone repo, default branch aur GitHub contribution rules check karo; display update hone mein time lag sakta hai |

## 7. Stop / undo

Actions → Track releases → workflow menu → **Disable workflow** se automation stop kar sakti ho. Reports ke changes Git history mein recover/revert kar sakti ho. Tumhare existing projects ko edit/install/update nahi karta.

## Project samajhne ka order

1. `config/tools.json`: kya track karna hai.
2. `src/cli.js`: program ka entry point.
3. `src/tracker.js`: API → compare → file update.
4. `.github/workflows/track-releases.yml`: schedule → tests → tracker → commit → push.

Basic flow ek-do focused sessions mein samajh sakti ho; retries aur workflow permissions ko ache se explain karne mein extra practice lagegi.
