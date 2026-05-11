# Content Safety — Immutable Rules

These rules are **immutable**. They MUST NOT be loosened, overridden, bypassed, or made configurable at any level of the governance hierarchy (Town/Library/Bookshelf/Book). They apply to all content — AI-generated, user-generated, imported, or derived.

## Prohibited content (absolute)

1. **No pornographic or sexually explicit material.** This includes text, images, generated prose, scenario descriptions, and any interactive content that depicts or simulates sexual acts.

2. **No copyrighted intellectual property.** No trademarked names, settings, characters, or worlds (Middle-earth, Star Wars, Marvel, Disney, etc.). Public domain works are permitted (Sherlock Holmes, ancient mythology, Treasure Island). When in doubt, use original settings and characters.

3. **No real people as characters.** Users MUST NOT create, generate, or simulate content depicting real living or deceased people — public figures, celebrities, politicians, private individuals, or any identifiable person. Fictional characters only.

4. **No extreme violence or gore.** Narrative conflict is fine; graphic torture, mutilation, or gratuitous violence is not.

## AI enforcement (mandatory)

These rules MUST be enforced programmatically, not just by policy:

1. **System prompt hardening.** Every LLM call MUST include immutable system-level instructions that prohibit the generation of content violating the rules above. These instructions MUST NOT be overridable by user prompts, story configuration, or any application-level setting.

2. **Output validation.** AI-generated content SHOULD pass through a safety filter (e.g., a lightweight guard model like Llama-Guard, regex patterns, or keyword detection) before being displayed to the user. Silent failures are not acceptable — if content is blocked, the user MUST see a clear, non-technical explanation.

3. **Input validation.** User-submitted prompts, story text, and character definitions MUST be scanned for prohibited content before being passed to the LLM or stored.

4. **Immutability.** The content safety rules MUST be compiled into the application binary or loaded from a signed, non-user-editable configuration. They MUST NOT be stored in user-accessible config files, environment variables, or editable YAML/JSON.

## Report User (mandatory for UGC)

Any feature that allows user-generated content (stories, characters, scenarios, shared worlds) or AI-generated content visible to other users MUST include:

1. **A "Report" button** — visible on every piece of shared content. One tap to flag.
2. **Report categories** — at minimum: "Inappropriate/explicit content", "Copyright violation", "Depicts a real person", "Other".
3. **Report persistence** — reports MUST be stored durably (not just logged). They MUST be reviewable by the content owner/admin.
4. **Actioning** — repeated reports against the same content or user SHOULD trigger automatic hiding of the content pending review. Thresholds are configurable per project.
5. **No retaliation** — the reporter's identity MUST NOT be disclosed to the reported user.

## Apple App Store compliance

- Apple Guideline 1.1: Apps MUST NOT include objectionable content.
- Apple Guideline 1.2: User-generated content MUST have a "Block and Report" mechanism.
- Apple Guideline 3.1.2: Users MUST NOT lose access to content they created if a subscription expires.
- In App Review Notes, explicitly describe the content safety enforcement stack.
