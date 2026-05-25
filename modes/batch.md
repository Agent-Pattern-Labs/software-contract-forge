# Batch Mode

Process many contract leads from `batch/batch-input.tsv`.

## Inputs

`batch/batch-input.tsv` columns:

```text
id	url	source	notes
```

## Procedure

1. If `batch/batch-input.tsv` has no rows and pending leads exist in `data/pipeline.md`, run `software-contract-forge batch:prepare --limit N` or `batch/batch-runner.sh --from-pipeline --limit N`.
2. Prefer `batch/batch-runner.sh` for durable batch runs.
3. Keep parallelism bounded to 2 unless the batch runner has an explicit lease/state mechanism.
4. Each worker should qualify first, then apply or draft only when gates pass.
5. Write worker outputs under `reports/` and `batch/tracker-additions/`.
6. For portal batches, use `portal:preflight --format json` to separate `userActions` from `reviewItems`. Queue hCaptcha/reCAPTCHA/Turnstile, login, and security-code items for `portal:handoff`; queue compensation, authorization, availability, legal, and identity items for user review.
7. Settle final state in `data/applications/`.

## Output

Return workflow state path, counts, and unresolved blockers.
