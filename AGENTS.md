# AGENTS.MD -- Shared Rules

## Start

- Read `coding-rules.md` and `process-rules.md` before any work.
- Check for a project-level `AGENTS.local.md` and `CLAUDE.local.md` in the working repo -- those add project-specific constraints on top of these shared rules.
- Shared rules MUST NOT be loosened by local overrides. Local files may only tighten.

## Roles

See `personas.md` for full team structure, voices, and handoff protocol. Each project appends a short repo suffix to persona names (e.g., `-cdn`, `-phan`, `-dnd`).

## Principles

- One thing at a time. Finish A before starting B.
- Plan first for non-trivial changes.
- Fail fast with clear messages.
- No hardcoded values. Config layer for everything.
- Swappable backends behind interfaces.
- Test-driven: write the failing test first.
- Commit often, push to main, no snowflakes.

## Commands

- Defer to project-level `AGENTS.local.md` for build/test/run commands.
- If no local agents file exists, read `README.md` for project-specific setup.
