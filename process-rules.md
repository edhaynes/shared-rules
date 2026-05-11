# Process Rules for LLM Pair Programming — Cannon Edition

These rules govern **project-level tracking, documentation, and lifecycle duties** that the LLM MUST perform alongside coding work. They complement `coding-rules.md` (which covers coding standards and architecture).

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

---

## 1. README and port allocation

### Port assignment

At project start, the LLM MUST create a `README.md` if one does not exist. The README MUST assign a random base port `XXX0` (e.g., `7070`, `8090`, `6040`) for the primary service. Additional services MUST increment the ones digit: `XXX1`, `XXX2`, etc. Port assignments MUST be documented at the top of the README.

### README content

After every major commit, the LLM MUST regenerate the README. The README MUST answer:

1. What is this and who is it for?
2. Quick start (prereqs, install, run) — copy-pasteable for macOS, Linux, Windows.
3. Configuration table (env var, default, description, required?).
4. How to run tests.
5. Architecture overview.
6. Deployment notes (local, container, cloud).
7. Troubleshooting (top 5 actual issues).

The LLM SHOULD maintain an `ARCHITECTURE.md` for deeper detail and `docs/adr/` for decision records.

---

## 2. Bug and feature tracking

The LLM MUST maintain two files at the repo root:

- **`bugs.md`** — running list of known bugs. When a bug is discovered or reported, the LLM MUST add it with a short description, date observed, and status (`open` / `fixed` with commit ref).
- **`features.md`** — running list of planned or requested features. When a future feature or enhancement is mentioned, the LLM MUST add it with a short description, date added, and status (`planned` / `in progress` / `done`).

Before starting work on a bug or feature, the LLM MUST check these files for existing entries to avoid duplicates.

When a bug is fixed or a feature is shipped, the LLM MUST update the entry in-place with the resolution date and commit/PR reference.

---

## 3. Plan tracking

At session start and whenever plan files change, the LLM MUST scan `/plans` and `PLAN_*.md`:

1. Evaluate whether each plan has been implemented by checking the codebase.
2. Update the first line with `Status: Implemented, <date>` / `Status: Partial — Remaining: <items>` / `Status: Not Implemented`.
3. Update `PLANS.md` at the repo root with a current status table.

The LLM MUST NOT modify plans in `/archive` subdirectories — those are retired.

---

## 4. Project memory and decisions

- The LLM MUST maintain `CLAUDE.md` at the repo root with standing project instructions.
- The LLM SHOULD maintain `docs/adr/` for Architecture Decision Records. ADRs MUST be numbered and MUST NOT be edited after acceptance.
- The LLM SHOULD maintain `docs/MEMORY.md` as a running log of preferences and gotchas not worthy of a full ADR.
- When a standing decision is made in chat, the LLM MUST propose an ADR or MEMORY entry in the same commit.
- The LLM MUST read all of these files before proposing an approach and MUST surface conflicts with recorded decisions before doing the work.
