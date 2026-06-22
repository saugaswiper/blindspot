#!/bin/bash
# Install the loop as macOS launchd jobs (run while you're logged in; survive reboots).
# Times are LOCAL. Schedule: planner Mon 08:57, dev 09:07, tester 12:07, librarian 13:07.
set -euo pipefail
LA="$HOME/Library/LaunchAgents"
RUN="/Users/dharmayudesai/blindspot/loop/run.sh"
chmod +x "$RUN"
mkdir -p "$LA"

plist() {  # $1=role $2=hour $3=minute [$4=weekday]
  local role="$1" hour="$2" min="$3" wd="${4:-}"
  local label="com.blindspot.loop.$role"
  local wdxml=""
  [ -n "$wd" ] && wdxml="    <key>Weekday</key><integer>$wd</integer>"
  cat > "$LA/$label.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUN</string><string>$role</string></array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$min</integer>
$wdxml
  </dict>
  <key>StandardErrorPath</key><string>/Users/dharmayudesai/blindspot/loop/logs/$role.launchd.log</string>
  <key>StandardOutPath</key><string>/Users/dharmayudesai/blindspot/loop/logs/$role.launchd.log</string>
</dict></plist>
EOF
  launchctl unload "$LA/$label.plist" 2>/dev/null || true
  launchctl load "$LA/$label.plist"
  echo "installed $label"
}

plist planner   8 57 1     # Monday
plist dev       9  7
plist tester    12 7
plist librarian 13 7
echo "Done. Logs: /Users/dharmayudesai/blindspot/loop/logs/  ·  disable: loop/uninstall.sh"
