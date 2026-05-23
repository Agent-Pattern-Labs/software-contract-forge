# Scan Mode

Find new software contract opportunities from approved sources.

## Inputs

- `config/sources.yml`
- `config/client-profile.yml`
- Existing keys from `data/pipeline.md`, `data/applications/`, and `reports/`

## Procedure

1. Read `config/sources.yml` and scan only approved sources.
2. For enabled public RSS/API sources, prefer `software-contract-forge scan` so fetch, extraction, canonical keys, and dedupe are deterministic.
3. For browser-only marketplaces or portals, delegate scan work and stop on login, captcha, paid credits, or legal/compliance blockers.
4. For each candidate, extract source, URL, buyer, title, deadline, budget/rate if present, location/eligibility, and short notes.
5. Use `software-contract-forge canon:key opportunity` for identity when the scan helper is not already producing keys.
6. Dedupe before adding the lead.
7. Append new leads to `data/pipeline.md` or emit TSV rows for `batch/batch-input.tsv`.
8. Mark uncertain, login-blocked, or paywalled leads as `blocked` with a short reason.

## Public Source Helper

```sh
software-contract-forge scan
software-contract-forge scan --source SOURCE_NAME --limit 10
software-contract-forge scan --write
```

The helper dry-runs by default. Use `--write` only after confirming the source configuration is approved for appending discovered leads.

## Delegation

Delegate browser-heavy scans to `@general-free`, max 2 parallel source workers. Keep source lists and client profile facts file-backed.

## Output

Return the number of new, duplicate, skipped, and blocked leads plus paths changed.
