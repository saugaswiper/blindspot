# Blindspot Local Improvement Loop (subscription-based)

Runs the 4-role gated loop locally via the `claude` CLI on your **subscription** — no API
key, no secrets, no deploy key. Model-tiered for efficiency. Documented in the wiki:
`Meta/Autonomous Loop.md`.

| Role | Time (local) | Model | Does |
|------|--------------|-------|------|
| planner | Mon 08:57 | sonnet | write next `spec/briefs/NNN.md` → branch |
| dev | daily 09:07 | **opus** | implement top brief → gates → `spec/NNN-handoff.md` → branch |
| tester | daily 12:07 | sonnet | validate vs. published SRs → `spec/validation/NNN.md` → branch |
| librarian | daily 13:07 | **haiku** | ingest new `spec/*` into the wiki → push wiki |

## Run / schedule
- **Test one role now (supervised):** `bash loop/run.sh librarian` (safest) or `dev`.
  Watch `loop/logs/<role>-<ts>.log`.
- **Schedule (launchd):** `bash loop/install.sh` — installs jobs that fire at the times
  above while you're logged in (and on next login if the Mac was asleep/off).
- **Disable:** `bash loop/uninstall.sh`.

## How it's gated & safe
- Build roles (planner/dev/tester) push a **branch** `loop/<role>-<ts>` — they never touch
  `main`. You open a PR / review the branch and merge.
- The **librarian** is the only writer of the wiki and pushes the wiki repo directly.
- Each run is a single `claude -p` invocation scoped to one stage (bounded usage).
- Requirements: Mac on + logged in at run time; `claude` CLI logged in to your subscription;
  `npm` on PATH for the dev gates.

## Notes
- Uses your **subscription usage**, not metered API billing. Model tiering keeps each run
  cheap against your usage window.
- No PRs are auto-created (no `gh` CLI) — branches are pushed; open the PR in GitHub's UI.
  Install `gh` if you want `run.sh` to open PRs automatically.
