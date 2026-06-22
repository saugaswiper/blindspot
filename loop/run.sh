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
  planner)   MODEL="claude-sonnet-4-6";;
  dev)       MODEL="claude-opus-4-8";;
  tester)    MODEL="claude-sonnet-4-6";;
  librarian) MODEL="claude-haiku-4-5-20251001";;
  *) echo "unknown role: $ROLE" >&2; exit 2;;
esac

run_claude() {  # $1 = working dir
  cd "$1" || exit 1
  "$CLAUDE" -p "$(cat "$CODE/loop/prompts/$ROLE.md")" \
    --model "$MODEL" \
    --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
    >>"$LOG" 2>&1
}

echo "[$(date)] start $ROLE ($MODEL)" >>"$LOG"

if [ "$ROLE" = "librarian" ]; then
  run_claude "$WIKI"
  cd "$WIKI"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    git add -A
    git -c user.name='Blindspot Librarian' -c user.email='librarian@blindspot.local' \
      commit -m "loop(librarian): ingest new spec/* reports" >>"$LOG" 2>&1
    git push origin main >>"$LOG" 2>&1
    echo "[$(date)] librarian pushed wiki" >>"$LOG"
  else
    echo "[$(date)] librarian: no wiki changes" >>"$LOG"
  fi
else
  run_claude "$CODE"
  cd "$CODE"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    BR="loop/$ROLE-$TS"
    git checkout -b "$BR" >>"$LOG" 2>&1
    git add -A
    git -c user.name="blindspot-$ROLE" -c user.email="$ROLE@blindspot.local" \
      commit -m "loop($ROLE): automated run" >>"$LOG" 2>&1
    git push origin "$BR" >>"$LOG" 2>&1
    git checkout main >>"$LOG" 2>&1
    echo "[$(date)] $ROLE pushed branch $BR — open a PR to review" >>"$LOG"
  else
    echo "[$(date)] $ROLE: no changes" >>"$LOG"
  fi
fi
echo "[$(date)] done $ROLE" >>"$LOG"
