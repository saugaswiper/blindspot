#!/bin/bash
# Remove the loop's launchd jobs (stops all scheduled runs).
set -uo pipefail
LA="$HOME/Library/LaunchAgents"
for role in planner dev tester librarian; do
  label="com.blindspot.loop.$role"
  launchctl unload "$LA/$label.plist" 2>/dev/null || true
  rm -f "$LA/$label.plist"
  echo "removed $label"
done
echo "Loop disabled. Re-enable with loop/install.sh"
