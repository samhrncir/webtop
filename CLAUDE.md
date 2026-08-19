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
npm test          # run once (what CI runs)
npm run test:watch
```

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
