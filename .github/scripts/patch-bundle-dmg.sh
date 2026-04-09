#!/usr/bin/env bash
# Patches bundle_dmg.sh in-place so it runs create-dmg with --skip-jenkins.
# Required on GitHub Actions CI (no Finder/AppleScript available in headless runners).
set -euo pipefail

DMG_SCRIPT="${1:-}"
if [[ -z "$DMG_SCRIPT" || ! -f "$DMG_SCRIPT" ]]; then
  echo "Usage: patch-bundle-dmg.sh <path-to-bundle_dmg.sh>"
  exit 1
fi

if grep -q -- "--skip-jenkins" "$DMG_SCRIPT"; then
  echo "Already patched: $DMG_SCRIPT"
  exit 0
fi

echo "Patching bundle_dmg.sh to add --skip-jenkins..."
sed -i '' 's/create-dmg /create-dmg --skip-jenkins /g' "$DMG_SCRIPT"
echo "Done: $DMG_SCRIPT"
