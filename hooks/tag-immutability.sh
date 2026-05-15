#!/usr/bin/env bash
# tag-immutability.sh — pre-push hook that rejects any push which would
# move, delete, or force-overwrite an existing remote tag.
#
# Enforces shared-rules coding-rules.md §8.1 "Tags are immutable" on
# repos where GitHub-side tag protection isn't available (e.g. private
# repos on the Free plan, where the rulesets API returns 403).
#
# Install:
#   ln -sf /path/to/shared-rules/hooks/tag-immutability.sh \
#          .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# Or have your pre-commit framework wire it in as a pre-push hook.
#
# Behavior:
#   - Allows push of NEW tags (no remote ref yet).
#   - Rejects any tag push where the local SHA differs from the remote SHA.
#   - Rejects any tag delete (push of the empty SHA to refs/tags/*).
#   - Other refs (branches) pass through unchanged.
#
# Stdin protocol (per githooks(5)):
#   <local ref> <local sha> <remote ref> <remote sha>

set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
exit_code=0

while read -r local_ref local_sha remote_ref remote_sha; do
    # Only inspect tag refs.
    case "$remote_ref" in
        refs/tags/*) ;;
        *) continue ;;
    esac

    tag_name="${remote_ref#refs/tags/}"

    # Tag deletion.
    if [ "$local_sha" = "$ZERO" ]; then
        echo "REJECTED: refusing to delete remote tag '$tag_name'." >&2
        echo "  Tags are immutable per shared-rules §8.1." >&2
        exit_code=1
        continue
    fi

    # New tag — remote has no SHA yet. Allow.
    if [ "$remote_sha" = "$ZERO" ] || [ -z "$remote_sha" ]; then
        continue
    fi

    # Tag exists on remote with a different SHA — would overwrite.
    if [ "$local_sha" != "$remote_sha" ]; then
        echo "REJECTED: refusing to move remote tag '$tag_name'." >&2
        echo "  Remote points to: $remote_sha" >&2
        echo "  Local points to:  $local_sha" >&2
        echo "  Tags are immutable per shared-rules §8.1. Pick a new tag name." >&2
        exit_code=1
        continue
    fi
done

exit "$exit_code"
