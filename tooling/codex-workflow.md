# Codex Workflow

This note describes how Codex should work in projects that inherit the shared
rules. It does not replace `coding-rules.md`, `process-rules.md`, `CLAUDE.md`,
or `AGENTS.md`.

## Default Loop

1. Read the relevant shared and project-local instructions before acting.
2. Check the working tree and avoid unrelated user changes.
3. State the intended files and approach before editing non-trivial work.
4. Make the smallest change that solves the stated task.
5. Verify with focused tests, linters, or searches that match the risk.
6. Report what changed, what was verified, and any remaining risk.

## Guardrails

- Do not push unless the user's latest message explicitly says `push`.
- Do not delete, reset, or rewrite history without explicit approval.
- Do not add dependencies without the required license, maintenance, and
  ARM-support review.
- Before staging or committing, run a secret scan and show the diff summary.
- If the repo is already dirty, treat existing changes as user-owned unless
  proven otherwise.

## Small Task Pattern

For a small docs-only task, Codex should prefer one focused file, a simple
search-based verification, and no test run unless the docs are generated or
linked from code. For code tasks, Codex should add or run the narrowest useful
tests first, then broaden verification when the change touches shared behavior.
