#!/usr/bin/env bash
# Copy canonical OpenCode tool wrappers into ~/.config/opencode/tools/.
#
# Why a copy and not a symlink: OpenCode's plugin loader (bun) resolves
# symlinks to their real path, then looks up `@opencode-ai/plugin` from
# there. That package only exists under ~/.config/opencode/node_modules,
# so symlinks pointing into this repo cause a "Cannot find module" failure
# and silently kill tool resolution for the whole session.
#
# Run after editing files in ./tools/ or pulling shared-rules updates.
# Restart OpenCode afterward — the plugin registry is built at startup.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/tools" && pwd)"
DST="${OPENCODE_TOOLS_DIR:-${HOME}/.config/opencode/tools}"

mkdir -p "$DST"
echo "Syncing $SRC -> $DST"
for f in "$SRC"/*.ts; do
  cp "$f" "$DST/"
  echo "  $(basename "$f")"
done
echo
echo "Done. Restart OpenCode to pick up changes."
