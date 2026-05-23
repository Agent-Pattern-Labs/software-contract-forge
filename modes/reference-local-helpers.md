# Local Helpers

Use local helpers when they can replace prose reasoning.

## Commands

- `software-contract-forge today`: stable local date.
- `software-contract-forge slugify TEXT`: filename-safe slugs.
- `software-contract-forge canon:key opportunity --url URL --buyer BUYER --title TITLE`: stable opportunity key.
- `software-contract-forge canon:compare A B`: normalized identity comparison.
- `software-contract-forge score:explain`: score policy.
- `software-contract-forge score:compute --input score.json`: compute weighted score.
- `software-contract-forge score:check --input score.json`: validate score math.
- `software-contract-forge score:gate --gate apply --input score.json`: apply a configured gate.
- `software-contract-forge contract-line ...`: render a tracker/application TSV row.

## Rule

If a helper exists for a value, call it. Do not derive that value manually in the agent response.
