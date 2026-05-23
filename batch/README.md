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
