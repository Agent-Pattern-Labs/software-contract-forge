# software-contract-forge

Agentic harness for finding software contract opportunities, qualifying them against a local client profile, and applying or drafting proposals when the opportunity clears the configured gates.

## Quick Start

```sh
npm install
npm run validate
node bin/software-contract-forge.mjs help
```

Create a consumer project:

```sh
node bin/create-software-contract-forge.mjs ../my-contract-pipeline
cd ../my-contract-pipeline
npm install
```

Then fill in `config/client-profile.yml` and `config/sources.yml`, add leads to `data/pipeline.md`, and run the harness through your agent runtime using the synced instructions and modes.

## Shape

- `iso/` is the source of truth for shared agent instructions, subagents, MCP config, and the command router.
- `modes/` contains workflow procedures for scan, qualify, apply, proposal, pipeline, batch, tracker, and follow-up work.
- `templates/` contains executable policy: states, score gates, context bundles, capability boundaries, artifact contracts, and migrations.
- `bin/` exposes the package CLI, consumer scaffolder, and install-time sync.
- `scripts/` contains deterministic local helpers used by agents instead of deriving values in prose.

## License

MIT. See [LICENSE](LICENSE).
