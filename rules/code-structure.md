# Code Structure — OO and Data Formats

## Object-oriented by default

1. **All domain models MUST use classes**, not loose dicts, tuples, or untyped data bags. Every entity, configuration object, and service boundary gets a class with typed fields and clear responsibilities.

2. **Dataclasses / Pydantic models for data.** Use `@dataclass` or Pydantic `BaseModel` for DTOs, config objects, and anything that crosses a boundary (API request/response, store read/write, file I/O). No passing raw dicts between modules.

3. **Enums for fixed categories.** Status codes, entity types, severity levels, tiers — anything with a known set of values MUST be an Enum, not magic strings scattered through code.

4. **Typed collections.** `list[Server]` not `list[dict]`. `dict[str, Entity]` not `dict[str, Any]`. The type system is documentation — use it.

## JSON and YAML for human-readable data

1. **YAML for configuration and topology.** Anything a human edits by hand — topology definitions, scenario files, story definitions, deployment configs — MUST be YAML. YAML's readability matters more than JSON's strictness when humans are the primary audience.

2. **JSON for machine interchange.** API responses, state store serialization, wire protocols, and programmatic I/O SHOULD use JSON. Machines don't need YAML's readability overhead.

3. **No opaque binary formats for editable data.** If a user or developer is expected to read, edit, or diff the data, it MUST be a text format (YAML, JSON, or Markdown). Binary/proprietary formats are acceptable only for performance-critical paths (model weights, compiled assets) and MUST have a text-based export/import option.

4. **Schema-backed.** YAML and JSON config files SHOULD have a corresponding Pydantic model or JSON Schema that validates structure at load time. Fail fast on malformed data — never silently ignore unknown keys or wrong types.

5. **Comments in config.** YAML config files SHOULD include inline comments explaining non-obvious fields. JSON files (which don't support comments) MUST have a companion `.example` or schema doc.
