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

`scan` reads only enabled sources in `config/sources.yml`, dry-runs by default, dedupes against local tracker files, and appends discovered leads to `data/pipeline.md` only with `--write`. Per-source limits apply after duplicate filtering, so settled rows do not hide later fresh matches from the same source. Supported adapters include public RSS/API feeds, public ATS boards (`greenhouse`, `lever`, `ashby`), explicit first-party HTML career pages, and bounded sitemap extraction.

For batch processing, materialize pending pipeline leads first:

```sh
software-contract-forge batch:prepare --limit 20
batch/batch-runner.sh --from-pipeline --limit 20 --dry-run
batch/batch-runner.sh --parallel 2
```

`batch:prepare` reads unchecked rows from `data/pipeline.md`, writes `batch/batch-input.tsv`, and skips rows already settled in application or tracker state by default.

Preflight public ATS application forms before a portal-heavy batch:

```sh
software-contract-forge portal:preflight --input batch/batch-input.tsv --format json
```

`portal:preflight` detects required compensation, start-date, work-authorization, citizenship, legal, location, consent, captcha, and security-code surfaces that require user review or user action before non-binding submission. JSON output includes `userActions` and `reviewItems` so a batch runner can separate "user must complete a portal challenge" from "user must approve an answer." It does not submit applications.

When a portal blocks on a captcha, OTP/security code, login, or review-only field, use a headed handoff instead of trying to bypass it:

```sh
software-contract-forge portal:handoff --url https://example.test/jobs/123 --out reports/example-handoff.json
```

`portal:handoff` opens a persistent headed browser profile under `batch/.portal-handoff-browser`, waits for the user to complete the portal-side action, then records whether a terminal confirmation was detected. It is a human-in-the-loop helper, not an anti-bot bypass.

## Shape

- `iso/` is the source of truth for shared agent instructions, subagents, MCP config, and the command router.
- `modes/` contains workflow procedures for scan, qualify, apply, proposal, pipeline, batch, tracker, and follow-up work.
- `templates/` contains executable policy: states, score gates, context bundles, capability boundaries, artifact contracts, and migrations.
- `bin/` exposes the package CLI, consumer scaffolder, and install-time sync.
- `scripts/` contains deterministic local helpers used by agents instead of deriving values in prose.

## License

MIT. See [LICENSE](LICENSE).
