# Webtop — Claude Code SOP

## Multi-Agent Workflow

This project supports running two Claude Code agents in parallel via **git worktrees**.

### Directory layout

```
ai-coding/
├── webtop/          ← Agent 1 (primary), branch: main or agent1/<feature>
└── webtop-agent2/   ← Agent 2 (secondary), branch: agent2/<feature>
```

Each agent has its own working directory and branch. They share the same git history (`.git` lives in `webtop/`).

### Starting a new multi-agent session

**Agent 1** (in `webtop/`):
```powershell
# Already here. Create a feature branch if needed:
git checkout -b agent1/<feature-name>
```

**Agent 2** (in `webtop-agent2/`):
```powershell
# If the worktree doesn't exist yet:
git worktree add ../webtop-agent2 -b agent2/<feature-name>

# If it already exists, just rename the branch for the new session:
git checkout -b agent2/<feature-name>
```

Open a second terminal, `cd` into `webtop-agent2/`, and start Claude Code there.

### Rules for both agents

- **Never work on the same branch.** Each agent owns its branch exclusively.
- **Never edit the same file at the same time** unless you've coordinated with the other agent first.
- Commit frequently so the other agent can `git log` to see what's been done.
- Before merging back to `main`, do a `git pull --rebase origin main` to stay current.

### Merging work back

Either agent can open a PR or merge directly:
```powershell
git checkout main
git merge --no-ff agent1/<feature-name>
git merge --no-ff agent2/<feature-name>
```

Or use `gh pr create` from each worktree.

### Cleaning up a worktree after a session

```powershell
# From the primary webtop/ directory:
git worktree remove ../webtop-agent2
git branch -d agent2/<feature-name>
```

The `webtop-agent2/` directory is a permanent fixture — just reset its branch each session rather than recreating it.

### Listing active worktrees

```powershell
git worktree list
```

## Testing

Vitest + React Testing Library. Tests are behavioral specs — the suite doubles
as feature documentation, so describe/it names read as sentences about what
the app does.

```powershell
npm test          # run once with the coverage gate (what CI runs)
npm run test:fast # run without coverage, for quick iteration
npm run test:watch
```

**Coverage ratchet:** `npm test` fails if coverage over `src/**` drops below
the thresholds in `vite.config.js` — an untested new feature fails CI.
When a local run beats the floors, vitest's `autoUpdate` rewrites them to
the new values; commit that bump with your PR. The floors only go up —
never lower them by hand to get a PR through; write the missing specs.

Rules for both agents:

- **Every feature or bugfix PR carries its specs.** A fixed bug gets a test
  that would have caught it.
- **Colocate tests** next to the source: `src/utils/foo.test.js`,
  `src/hooks/useHomescreen.test.jsx`.
- **Put new logic where it's testable**: pure helpers in `src/utils/`,
  stateful behavior in hooks. Components stay thin; component tests cover
  user-visible flows, not implementation details. No snapshot tests.
- **Tests never touch the network.** `src/test/setup.js` disables fetch and
  stubs browser APIs jsdom lacks; `src/lib/supabase.js` runs on an inert stub
  when no env credentials exist, so the whole data layer is testable offline.
- CI (`.github/workflows/ci.yml`) runs `npm test` + `npm run build` on every
  PR; a red check blocks merging.

## Android app (Capacitor)

The web app ships as an Android app via Capacitor: the built `dist/` is
bundled into a native WebView shell in `android/` (a committed Gradle
project). `capacitor.config.json` holds the app id
(`com.samhrncir.browserhome`) and shell settings.

```powershell
npm run build            # build web assets (reads .env for Supabase vars)
npx cap sync android     # copy dist/ + plugin config into android/
cd android; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

- **CI**: `.github/workflows/android.yml` builds the debug APK on pushes to
  main (and manually via Run workflow) and uploads it as an artifact.
  It reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repo Actions
  secrets; without them the APK runs local-only (no sign-in/sync).
- **Icons/splash** are generated from `assets/logo.svg` with
  `npx @capacitor/assets generate --android` (plus the background-color
  flags in git history) — rerun after changing the logo.
- **Safe areas**: the shell injects `--safe-area-inset-*`; `src/App.css`
  pads `.app` with them (inert in desktop browsers).
- External links (bookmarks) open in the system browser — that is
  Capacitor's default for non-app origins, not something to "fix".
- On the native app, Settings > Export routes through the system share
  sheet (@capacitor/filesystem + @capacitor/share; WebViews ignore anchor
  downloads); the web build keeps the plain download. Import accepts
  blank/octet-stream MIME types because Android pickers mislabel JSON.
