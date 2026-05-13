#!/usr/bin/env python3
"""Agent-agnostic pre-commit check for plan/tracker status hygiene.

Copy this into a project repo (for example under ``scripts/``) or call it
from a repo-local ``.githooks/pre-commit`` / ``.pre-commit-config.yaml``.
It checks the staged Git index by default.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path.cwd()
TRACKER_ALLOWED = ("Open", "In Progress", "Completed")
PLAN_ALLOWED = (
    "Backlog",
    "Implemented",
    "In Progress",
    "Not Implemented",
    "Not Written Yet",
    "Partial",
)


def _git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def _staged_files() -> list[str]:
    result = _git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git diff failed")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _staged_text(path: str) -> str:
    result = _git(["show", f":{path}"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"could not read staged {path}")
    return result.stdout


def _worktree_text(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _is_plan(path: str) -> bool:
    p = Path(path)
    return (
        p.suffix == ".md"
        and (
            p.parts[:1] == ("plans",)
            or any(part == "plans" for part in p.parts)
            or p.name.startswith("PLAN_")
        )
        and "archive" not in p.parts
    )


def _check_tracker_table(path: str, text: str) -> list[str]:
    errors: list[str] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped.startswith("|") or stripped.startswith("|---"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 4 or cells[0] in {"#", "Feature"}:
            continue
        status = cells[-1]
        if not status.startswith(TRACKER_ALLOWED):
            errors.append(
                f"{path}:{lineno}: status must start with Open, In Progress, "
                f"or Completed; got {status!r}"
            )
    return errors


def _check_plan(path: str, text: str) -> list[str]:
    lines = text.splitlines()
    first = lines[0].strip() if lines else ""
    if not first.startswith("Status: "):
        return [f"{path}:1: plan files must start with 'Status: ...'"]
    status = first.removeprefix("Status: ").strip()
    if not status.startswith(PLAN_ALLOWED):
        return [
            f"{path}:1: plan status must start with one of "
            f"{', '.join(PLAN_ALLOWED)}; got {status!r}"
        ]
    return []


def check(paths: list[str], *, staged: bool) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if path not in {"features.md", "bugs.md"} and not _is_plan(path):
            continue
        text = _staged_text(path) if staged else _worktree_text(path)
        if path in {"features.md", "bugs.md"}:
            errors.extend(_check_tracker_table(path, text))
        if _is_plan(path):
            errors.extend(_check_plan(path, text))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--staged",
        action="store_true",
        help="Check staged tracker files from the Git index.",
    )
    parser.add_argument("paths", nargs="*", help="Optional explicit paths to check.")
    args = parser.parse_args()

    staged = args.staged or not args.paths
    paths = _staged_files() if staged else args.paths
    try:
        errors = check(paths, staged=staged)
    except RuntimeError as exc:
        print(f"plan tracker status check failed: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("Plan/tracker status hygiene failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        print(
            "\nUse plan statuses like 'Status: In Progress' or "
            "'Status: Implemented, YYYY-MM-DD', and tracker statuses starting "
            "with Open, In Progress, or Completed.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
