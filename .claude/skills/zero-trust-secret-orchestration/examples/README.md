# Examples

End-to-end, runnable samples for each surface this SKILL delivers. Each
subfolder is independent — pick the one that matches how you intend to
consume the SKILL's reference impls.

| Surface | Folder         | When to use                                                                                  |
| ------- | -------------- | -------------------------------------------------------------------------------------------- |
| SDK     | [`sdk/`](sdk/) | Embedding the resolver / strategies / harness inside another Node or Python codebase.        |
| CLI     | [`cli/`](cli/) | Shell automation: fetching a secret with `zts get`, running the audit with `zts audit`.      |
| API     | [`api/`](api/) | The programmatic public surface — `app.secrets.resolve(key)` (Fastify) / `Depends(get_secrets)` (FastAPI). |

## Conventions

- Every example is self-contained: prerequisites, setup, the run, and
  expected output.
- Examples assume the SKILL's reference impls in
  `references/mjs/` and `references/py/` are installed (`make install`
  per package).
- Secrets / config come from environment variables or the macOS keychain
  — never hardcoded in the example file.
- Examples double as smoke tests — `examples/` should be runnable end-to-end
  as part of release validation. The biometric SDK scenario is the one
  exception — it is marked `manual` because it cannot be exercised
  non-interactively in CI.
