# @agent-pattern-labs/software-contract-forge

Agentic harness for finding software contract opportunities, qualifying them against a local client profile, and applying or drafting proposals when the opportunity clears the configured gates.

## Quick Start

```sh
npm install
npm run validate
node bin/software-contract-forge.mjs help
```

Create a consumer project:

```sh
npx --package @agent-pattern-labs/software-contract-forge create-software-contract-forge ../my-contract-pipeline
cd ../my-contract-pipeline
npm install
```

Then fill in `config/client-profile.yml` and `config/sources.yml`, add leads to `data/pipeline.md`, and run the harness through your agent runtime using the synced instructions and modes.

Public RSS/API sources can be scanned from a consumer project:

```sh
software-contract-forge scan
software-contract-forge scan --source weworkremotely-programming --limit 10
software-contract-forge scan --write
```

`scan` reads only enabled sources in `config/sources.yml`, dry-runs by default, dedupes against local tracker files, and appends discovered leads to `data/pipeline.md` only with `--write`. Supported adapters include public RSS/API feeds, public ATS boards (`greenhouse`, `lever`, `ashby`), explicit first-party HTML career pages, and bounded sitemap extraction.

## Shape

- `iso/` is the source of truth for shared agent instructions, subagents, MCP config, and the command router.
- `modes/` contains workflow procedures for scan, qualify, apply, proposal, pipeline, batch, tracker, and follow-up work.
- `templates/` contains executable policy: states, score gates, context bundles, capability boundaries, artifact contracts, and migrations.
- `bin/` exposes the package CLI, consumer scaffolder, and install-time sync.
- `scripts/` contains deterministic local helpers used by agents instead of deriving values in prose.

## License

MIT. See [LICENSE](LICENSE).
