# OpenCode Tooling Guidelines

These guidelines apply to OpenCode sessions. In non-OpenCode contexts, they
are optional and can be ignored unless a project explicitly opts into them.

They extend `coding-rules.md` and `process-rules.md`. All hard rules from
those files still apply when OpenCode is used.

---

## Built-in tool suite

When working with the OpenCode assistant, you may use the built-in tool suite
(`glob`, `grep`, `read`, `edit`, `write`, `bash`, etc.) for rapid codebase
exploration and modifications. These tools are optional; the shared coding and
process rules still govern the work.

## Configuration files

If a project stores configuration for OpenCode scripts, use a simple JSON file
such as `opencode_config.json`. Keep it in the repository root and add it to
`.gitignore` if it contains secrets. The schema should be simple key-value
pairs matching existing environment variable names.

Example:

```json
{
  "use_tool_glob": true,
  "max_read_lines": 2000,
  "default_workdir": "."
}
```

## Treatment of OpenCode JSON files

Treat OpenCode `.json` files as non-secret only when they contain no
credentials. If they contain credentials, handle them like any other
secret-bearing file: scan them, gitignore them, and never commit them.
