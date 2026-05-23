# Shared Contract Policy

Software Contract Forge handles contract opportunity discovery, qualification, proposal drafting, submission, tracking, and follow-up.

## Required Local Files

- `config/client-profile.yml`: client capabilities, preferred work, geography, rates, exclusions, legal review rules, and auto-submit policy.
- `config/sources.yml`: approved sources to scan.
- `data/pipeline.md`: pending opportunity inbox.
- `data/applications/`: dated application/proposal outcome logs.
- `reports/`: qualification reports, score JSON, and proposal drafts.

## Canonical States

Use `templates/states.yml`:

- `discovered`: found but not qualified.
- `qualified`: score gate passed and opportunity is worth action.
- `proposal_drafted`: proposal or answers drafted but not submitted.
- `applied`: non-binding application, expression of interest, or proposal submitted.
- `follow_up_due`: submitted and awaiting follow-up.
- `won`: contract awarded.
- `lost`: rejected, expired, or buyer chose another vendor.
- `skipped`: deliberately not pursued.
- `blocked`: cannot proceed without user input, login, missing evidence, or legal/pricing review.

## Score Dimensions

Use `templates/score.json` and `software-contract-forge score:*`.

- `fit`: technical and domain match.
- `budget`: likely commercial viability.
- `probability`: chance of credible response or award.
- `risk`: legal, payment, compliance, platform, or delivery risk.
- `timeline`: deadline and delivery feasibility.
- `strategic`: portfolio, relationship, or repeat-work value.

## Binding-Term Rule

Do not submit binding price, legal terms, exclusivity, indemnity, compliance attestations, delivery dates, or SOW commitments unless `config/client-profile.yml` explicitly allows automatic submission for that class of commitment. If not allowed, write a draft and mark it for user review.

## Dedupe Rule

Before applying or drafting, derive an opportunity key:

```sh
software-contract-forge canon:key opportunity --url URL --buyer BUYER --title TITLE
```

Check the key, URL, buyer, and title against `data/pipeline.md`, `data/applications/`, `batch/tracker-additions/`, and relevant `reports/`.

## Artifact Rule

Every important claim must trace to one of:

- Source page or pasted opportunity text.
- `config/client-profile.yml`.
- `data/pipeline.md`.
- `data/applications/`.
- `reports/*.md` or score JSON.
- A deterministic helper output.
