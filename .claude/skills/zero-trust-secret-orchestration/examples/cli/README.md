# CLI Examples

Shell-driven usage. The reference `mjs` package ships a tiny `zts` CLI
wrapping the resolver + the F05 audit.

## Setup

```bash
cd <skill-dir>/references/mjs && make install && npm link
zts --version          # smoke check
```

(`npm link` installs the CLI on `PATH`. In CI, prefer
`./node_modules/.bin/zts` directly.)

One-time config: set the env that the production chain reads
(`NODE_ENV=production`, plus the canonical strategy chain env vars
documented in `references/mjs/README.md`).

## Commands

| #   | Command                                              | Description                                          |
| --- | ---------------------------------------------------- | ---------------------------------------------------- |
| 01  | [`zts get`](01-secret-get.md)                        | Resolve a single secret through the chain to stdout. |
| 02  | [`zts audit`](02-secret-audit.md)                    | Run the F05 audit against a target repo.             |
