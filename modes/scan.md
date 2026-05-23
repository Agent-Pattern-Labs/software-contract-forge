# Scan Mode

Find new software contract opportunities from approved sources.

## Inputs

- `config/sources.yml`
- `config/client-profile.yml`
- Existing keys from `data/pipeline.md`, `data/applications/`, and `reports/`

## Procedure

1. Read `config/sources.yml` and scan only approved sources.
2. For each candidate, extract source, URL, buyer, title, deadline, budget/rate if present, location/eligibility, and short notes.
3. Use `software-contract-forge canon:key opportunity` for identity.
4. Dedupe before adding the lead.
5. Append new leads to `data/pipeline.md` or emit TSV rows for `batch/batch-input.tsv`.
6. Mark uncertain, login-blocked, or paywalled leads as `blocked` with a short reason.

## Delegation

Delegate browser-heavy scans to `@general-free`, max 2 parallel source workers. Keep source lists and client profile facts file-backed.

## Output

Return the number of new, duplicate, skipped, and blocked leads plus paths changed.
