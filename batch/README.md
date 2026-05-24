# Batch Processing

Use `batch/batch-input.tsv` for many leads:

```text
id	url	source	notes
1	https://example.test/opportunity/123	manual	API migration
```

Run:

```sh
batch/batch-runner.sh --dry-run
batch/batch-runner.sh --parallel 2
```

Workers should qualify first, then draft or apply only when gates pass.

To materialize pending pipeline leads into the batch TSV:

```sh
software-contract-forge batch:prepare --limit 20
software-contract-forge batch:prepare --limit 20 --source g2i-ashby
batch/batch-runner.sh --from-pipeline --limit 20 --dry-run
```

`batch:prepare` reads unchecked rows from `data/pipeline.md`, skips rows already settled in `data/applications/` or `batch/tracker-additions/`, and writes `batch/batch-input.tsv`.
