# Reference implementations

Polyglot reference for the Zero-Trust Secret Orchestration spec.
See per-package READMEs in `mjs/` and `py/` for language-specific
wiring; this file documents the cross-language contract.

## Harness exit-code states

| `code` value                  | Meaning                                              |
| ----------------------------- | ---------------------------------------------------- |
| `0`                           | success                                              |
| positive integer              | child exited non-zero — application-level failure    |
| `null` (mjs) / `None` (py)    | killed by harness because `timeoutMs` expired        |

Consumers MUST handle `null` / `None` distinctly. Treating it as a
generic "non-zero" can leak a timeout into the resolver as a false
"resolution failure".
