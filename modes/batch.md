# Batch Mode

Process many contract leads from `batch/batch-input.tsv`.

## Inputs

`batch/batch-input.tsv` columns:

```text
id	url	source	notes
```

## Procedure

1. Prefer `batch/batch-runner.sh` for durable batch runs.
2. Keep parallelism bounded to 2 unless the batch runner has an explicit lease/state mechanism.
3. Each worker should qualify first, then apply or draft only when gates pass.
4. Write worker outputs under `reports/` and `batch/tracker-additions/`.
5. Settle final state in `data/applications/`.

## Output

Return workflow state path, counts, and unresolved blockers.
