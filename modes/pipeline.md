# Pipeline Mode

Process pending leads from `data/pipeline.md`.

## Procedure

1. Read pending unchecked lines from `data/pipeline.md`.
2. For 5+ leads, prefer `software-contract-forge batch:prepare --limit N` and then run batch mode from the generated `batch/batch-input.tsv`.
3. For each lead, run `qualify`.
4. For leads passing the `apply` gate, run `apply` only if the client profile permits the needed submission type.
5. Mark processed leads in `data/pipeline.md`.
6. Write reports and application rows as each lead settles.

## Parallelism

Use at most 2 parallel workers for source fetches or form submissions. Sequentially settle shared state after each round.

## Output

Return counts for qualified, applied, drafted, skipped, blocked, and failed leads.
