# Blindspot Autonomous Improvement Loop (GitHub Actions)

Gated, cloud, model-tiered implementation of the loop documented in the wiki
(`blindspot-wiki` → `Meta/Autonomous Loop.md`). Four scheduled workflows:

| Workflow | Schedule (UTC) | Model | Role |
|----------|----------------|-------|------|
| `loop-planner.yml` | Mon 15:07 | sonnet | pick next stage → write `spec/briefs/NNN.md` (PR) |
| `loop-dev.yml` | daily 16:07 | **opus** | implement top brief on a branch → PR + `spec/NNN-handoff.md` |
| `loop-tester.yml` | daily 19:07 | sonnet | validate the latest change vs. published SRs → `spec/validation/NNN.md` (PR) |
| `loop-librarian.yml`| daily 20:07 | **haiku** | ingest new `spec/*` into the wiki repo → push wiki |

> **Timezone:** GitHub cron is **UTC**. The times above are spread so dev → tester →
> librarian run in order. Adjust the `cron:` lines to your local offset if you prefer.

## One-time setup (you)
1. **Secrets** (repo → Settings → Secrets and variables → Actions):
   - `ANTHROPIC_API_KEY` — your Anthropic key.
   - `WIKI_DEPLOY_KEY` — a **read/write** SSH deploy key for `saugaswiper/blindspot-wiki`
     (the librarian pushes the wiki; others read it). Generate: `ssh-keygen -t ed25519 -f wiki_key`,
     add `wiki_key.pub` as a deploy key (Allow write access) on the wiki repo, paste the
     private `wiki_key` as the secret.
3. **Branch protection** on `main` (Settings → Branches): require a PR + your review before
   merge. This is what makes the loop *gated* — agents open PRs, you merge.
4. Enable Actions if disabled. Each workflow also has `workflow_dispatch` so you can run one
   manually to test.

## How it stays token-efficient
- **Model tiering** (haiku/sonnet/opus per role — the big lever).
- **Wiki-first context**: each role reads the compiled wiki, not the whole codebase.
- **One scoped stage per run**; **batched** librarian ingest.
- `concurrency: blindspot-loop` serializes the jobs so they never collide on hot files.

## Safety
- Agents never push to `main` (PRs only; dev/planner/tester). Librarian pushes only the
  **wiki** repo.
- Gates run before a PR is opened: `npm run lint`, `npm test`, `npm run build`.
- Prompts live in `.github/loop/*-prompt.md` (versioned, low-token).
