# Shared LLM Rules

This repo is the **single source of truth** for coding and process rules that apply to **all projects** using LLM pair programming (Claude, Cursor, Copilot, Codex, etc.).

## What belongs here

Only rules that are **universal across every project**:

- `coding-rules.md` -- coding standards, architecture, security, deployment, testing
- `process-rules.md` -- project tracking duties (README, bugs.md, features.md, plans, ADRs)
- `CLAUDE.md` -- root Claude Code instructions (references the rules files)
- `AGENTS.md` -- root agent instructions

## What does NOT belong here

Anything project-specific. Each repo should have its own:

- `CLAUDE.local.md` -- project-specific Claude guidance
- `AGENTS.local.md` -- project-specific agent guidance

These `.local.md` files inherit from and extend the shared rules. They may tighten constraints but MUST NOT loosen them (same governance model as the Town/Library/Bookshelf hierarchy in the coding rules).

## Usage

In each project's `CLAUDE.md`, reference the shared rules:

```markdown
@/path/to/shared-rules/coding-rules.md
@/path/to/shared-rules/process-rules.md
```

Then add project-specific instructions in `CLAUDE.local.md` alongside it.

## Editing

Edit rules **here**, not in downstream repos. Downstream repos reference these files; they don't copy them.
