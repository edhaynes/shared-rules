# Shared LLM Rules

This repo is the **single source of truth** for coding and process rules that apply to **all projects** using LLM pair programming (Claude, Cursor, Copilot, Codex, etc.).

## What belongs here

Only rules that are **universal across every project**:

- `coding-rules.md` -- coding standards, architecture, security, deployment, testing
- `process-rules.md` -- project tracking duties (README, bugs.md, features.md, plans, ADRs)
- `personas.md` -- team structure, voices, naming convention, handoff protocol
- `CLAUDE.md` -- root Claude Code instructions (references the rules files)
- `AGENTS.md` -- root agent instructions
- `hooks/` -- reusable, agent-agnostic Git hooks for downstream repos
- `rules/` -- domain-specific rule sets:
  - `rules/network-security.md` -- WireGuard/Tailscale zero-trust mesh requirements
  - `rules/content-safety.md` -- immutable content rules (no porn, no copyright, no real people) + AI enforcement + report-user requirements
  - `rules/code-structure.md` -- OO by default, dataclasses/Pydantic for data, YAML for human-readable config, JSON for machine interchange

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

## Reusable hooks

Projects SHOULD install the plan/tracker status hook when they use `bugs.md`,
`features.md`, `plans/`, or `PLANS.md`:

```yaml
repos:
  - repo: local
    hooks:
      - id: plan-tracker-status
        name: plan/tracker status hygiene
        entry: python3 /path/to/shared-rules/hooks/check_plan_tracker_status.py --staged
        language: system
        pass_filenames: false
```

This is deliberately not tied to any coding agent; it runs for normal Git
commits by humans, Claude, Codex, OpenCode, Cursor, and other tools alike.
