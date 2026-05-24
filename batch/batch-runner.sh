#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SOFTWARE_CONTRACT_FORGE_PROJECT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BATCH_DIR="$PROJECT_DIR/batch"
INPUT_FILE="$BATCH_DIR/batch-input.tsv"
PROMPT_FILE="$BATCH_DIR/batch-prompt.md"
RUNS_DIR="$PROJECT_DIR/.software-contract-forge-runs"
PARALLEL=1
DRY_RUN=false
FROM_PIPELINE=false
LIMIT=20
SOURCE=""
INCLUDE_SETTLED=false

usage() {
  cat <<'USAGE'
software-contract-forge batch runner

Usage: batch-runner.sh [--parallel N] [--dry-run] [--from-pipeline] [--limit N] [--source NAME]

Files:
  batch/batch-input.tsv
  batch/batch-prompt.md
  .software-contract-forge-runs/

Options:
  --from-pipeline       Populate batch/batch-input.tsv from pending data/pipeline.md rows before running.
  --limit N             Limit rows when using --from-pipeline. Defaults to 20.
  --source NAME         Filter pipeline rows by source when using --from-pipeline.
  --include-settled     Include rows already present in applications/tracker state.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel) PARALLEL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --from-pipeline) FROM_PIPELINE=true; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --include-settled) INCLUDE_SETTLED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ "$FROM_PIPELINE" == "true" ]]; then
  if [[ -f "$SCRIPT_DIR/../bin/software-contract-forge.mjs" ]]; then
    SCF_CMD=(node "$SCRIPT_DIR/../bin/software-contract-forge.mjs")
  elif [[ -x "$PROJECT_DIR/node_modules/.bin/software-contract-forge" ]]; then
    SCF_CMD=("$PROJECT_DIR/node_modules/.bin/software-contract-forge")
  elif command -v software-contract-forge >/dev/null 2>&1; then
    SCF_CMD=(software-contract-forge)
  else
    echo "software-contract-forge CLI is not available. Run npm install or use npx software-contract-forge batch:prepare."
    exit 1
  fi

  PREPARE_ARGS=(batch:prepare --limit "$LIMIT" --output "$INPUT_FILE")
  if [[ -n "$SOURCE" ]]; then
    PREPARE_ARGS+=(--source "$SOURCE")
  fi
  if [[ "$INCLUDE_SETTLED" == "true" ]]; then
    PREPARE_ARGS+=(--include-settled)
  fi
  "${SCF_CMD[@]}" "${PREPARE_ARGS[@]}"
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Missing $INPUT_FILE"
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Missing $PROMPT_FILE"
  exit 1
fi

mkdir -p "$RUNS_DIR"
echo "project: $PROJECT_DIR"
echo "input: $INPUT_FILE"
echo "parallel: $PARALLEL"

if [[ "$DRY_RUN" == "true" ]]; then
  awk -F '\t' 'NR > 1 && $1 != "" { print $1 "\t" $2 "\t" $3 "\t" $4 }' "$INPUT_FILE"
  exit 0
fi

if command -v iso-orchestrator >/dev/null 2>&1; then
  exec iso-orchestrator run \
    --name software-contract-forge \
    --input "$INPUT_FILE" \
    --prompt "$PROMPT_FILE" \
    --runs-dir "$RUNS_DIR" \
    --parallel "$PARALLEL"
fi

echo "iso-orchestrator is not available. Install dependencies or run batch rows manually through your agent runtime."
exit 1
