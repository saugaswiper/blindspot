#!/bin/bash
# Blindspot local improvement loop — runs one role via the Claude CLI on your
# SUBSCRIPTION (no API key), model-tiered, on the local repos. Gated: build roles
# push a branch (you merge); the librarian pushes the wiki directly (single writer).
set -uo pipefail

ROLE="${1:?usage: run.sh <planner|dev|tester|librarian>}"
CODE="/Users/dharmayudesai/blindspot"
WIKI="/Users/dharmayudesai/blindspot wiki"
CLAUDE="/Users/dharmayudesai/.local/bin/claude"
export PATH="/Users/dharmayudesai/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

LOGDIR="$CODE/loop/logs"; mkdir -p "$LOGDIR"
TS="$(date +%Y%m%d-%H%M)"
LOG="$LOGDIR/$ROLE-$TS.log"

case "$ROLE" in
  planner)   MODEL="claude-sonnet-5-5";;
  dev)       MODEL="claude-sonnet-5-5";;
  tester)    MODEL="claude-sonnet-5-5";;
  librarian) MODEL="claude-haiku-4-5-20251001";;
  *) echo "unknown role: $ROLE" >&2; exit 2;;
esac

run_claude() {  # $1 = working dir
  cd "$1" || exit 1
  bounded 21600 "$CLAUDE" -p "$(cat "$CODE/loop/prompts/$ROLE.md")" \
    --model "$MODEL" \
    --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
    >>"$LOG" 2>&1
}

# bounded command: alarm N cmd...  (macOS has no `timeout`)
bounded() { local n="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$n" "$@"; }
push_retry() { for i in 1 2 3 4; do bounded 120 git push "$@" >>"$LOG" 2>&1 && return 0; sleep 30; done
  echo "[$(date)] $ROLE: PUSH FAILED after 4 tries ($*) — commit is local only" >>"$LOG"; return 1; }

# One role at a time. launchd fires missed jobs together on wake (seen 2026-10-18: dev, tester
# and librarian all at 15:18 in one working tree; the librarian ingested an unmerged handoff
# the tester had checked out). Wait for the lock rather than skip, up to 8 h.
LOCK="$LOGDIR/.run.lock"
for i in $(seq 1 480); do
  if mkdir "$LOCK" 2>/dev/null; then echo $$ >"$LOCK/pid"; break; fi
  OTHER=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$OTHER" ] && ! kill -0 "$OTHER" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  [ "$i" = 1 ] && echo "[$(date)] $ROLE: waiting for run lock (pid $OTHER)" >>"$LOG"
  sleep 60
done
[ -d "$LOCK" ] && [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ] || { echo "[$(date)] $ROLE: lock timeout — skipping" >>"$LOG"; exit 0; }
trap 'rm -rf "$LOCK"' EXIT

# Skip when offline instead of hanging for hours (seen: ENOTFOUND runs of 3 h).
online() { bounded 20 curl -s -o /dev/null https://api.anthropic.com && bounded 45 git -C "$CODE" ls-remote -q origin HEAD >/dev/null 2>&1; }
for i in 1 2 3; do online && break; [ "$i" = 3 ] && { echo "[$(date)] $ROLE: offline (API or GitHub unreachable) — skipping" >>"$LOG"; exit 0; }; sleep 300; done

echo "[$(date)] start $ROLE ($MODEL)" >>"$LOG"

# Export ONLY the research-API keys the tester/dev need for live runs (Gemini, NCBI, OpenAlex,
# Elsevier). Deliberately NOT the Supabase service-role key (production DB admin) — an unattended
# agent must not hold it. Values are never echoed.
if [ -f "$CODE/.env.local" ]; then
  for K in GEMINI_API_KEY NCBI_API_KEY OPENALEX_API_KEY ELSEVIER_API_KEY; do
    V=$(grep -E "^${K}=" "$CODE/.env.local" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
    [ -n "$V" ] && export "$K=$V"
  done
fi

# Always start from the latest main, so runs never redo work that's already merged.
cd "$CODE" || exit 1
git checkout -q main >>"$LOG" 2>&1
git fetch -q --prune origin >>"$LOG" 2>&1
git pull -q --ff-only origin main >>"$LOG" 2>&1

# Gate: build roles wait for the human to review their previous output. Without this,
# an unattended loop re-implements the same brief every day (seen Jul-Aug 2026: 13
# duplicate dev branches for brief 008).
if [ "$ROLE" != "librarian" ]; then
  PENDING=$(git branch -r --no-merged origin/main 2>/dev/null | grep -c "origin/loop/$ROLE-")
  if [ "$PENDING" -gt 0 ]; then
    echo "[$(date)] $ROLE: $PENDING unmerged loop/$ROLE branch(es) awaiting review — skipping. Merge or delete them first." >>"$LOG"
    exit 0
  fi
fi

if [ "$ROLE" = "librarian" ]; then
  if [ "$(git -C "$CODE" rev-parse --abbrev-ref HEAD)" != "main" ] || [ -n "$(git -C "$CODE" status --porcelain)" ]; then
    echo "[$(date)] librarian: code repo not on a clean main — refusing (would ingest unmerged work)" >>"$LOG"; exit 0
  fi
  run_claude "$WIKI"
  cd "$WIKI"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    git add -A
    git -c user.name='Blindspot Librarian' -c user.email='librarian@blindspot.local' \
      commit -m "loop(librarian): ingest new spec/* reports" >>"$LOG" 2>&1
    push_retry origin main && echo "[$(date)] librarian pushed wiki" >>"$LOG"
  else
    echo "[$(date)] librarian: no wiki changes" >>"$LOG"
  fi
else
  run_claude "$CODE"
  cd "$CODE"
  PARTIAL=""
  if grep -qiE "hit your (session|usage) limit|usage limit reached" "$LOG"; then
    PARTIAL="-PARTIAL"
    echo "[$(date)] $ROLE: PARTIAL RUN — usage limit hit mid-run; gates/handoff likely missing. Review before merging." >>"$LOG"
  fi
  # Agent may have checked out another branch (e.g. tester reading a dev branch): never
  # build our branch on top of it.
  if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    echo "[$(date)] $ROLE: agent left HEAD on $(git rev-parse --abbrev-ref HEAD) — returning to main" >>"$LOG"
    git checkout -q main >>"$LOG" 2>&1 || { echo "[$(date)] $ROLE: cannot return to main — aborting, tree left as-is" >>"$LOG"; exit 1; }
  fi
  # Role write scope: planner only spec/briefs/, tester only spec/validation/.
  case "$ROLE" in planner) SCOPE="spec/briefs/";; tester) SCOPE="spec/validation/";; *) SCOPE="";; esac
  if [ -n "$SCOPE" ]; then
    git diff HEAD --name-only | grep -v "^$SCOPE" | while read -r f; do
      echo "[$(date)] $ROLE: out-of-scope change dropped: $f" >>"$LOG"; git restore --source=HEAD --staged --worktree -- "$f"; done
    git ls-files --others --exclude-standard | grep -v "^$SCOPE" | while read -r f; do
      echo "[$(date)] $ROLE: out-of-scope file dropped: $f" >>"$LOG"; rm -f "$f"; done
  fi
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    BR="loop/$ROLE-$TS$PARTIAL"
    git checkout -b "$BR" >>"$LOG" 2>&1
    git add -A
    git -c user.name="blindspot-$ROLE" -c user.email="$ROLE@blindspot.local" \
      commit -m "loop($ROLE): automated run${PARTIAL:+ (PARTIAL: usage limit hit)}" >>"$LOG" 2>&1
    push_retry origin "$BR" && echo "[$(date)] $ROLE pushed branch $BR — open a PR to review" >>"$LOG"
    git checkout main >>"$LOG" 2>&1
  else
    echo "[$(date)] $ROLE: no changes" >>"$LOG"
  fi
fi
echo "[$(date)] done $ROLE" >>"$LOG"
