# Software Contract Forge Batch Worker

You are processing a bounded batch of software contract opportunities.

For each input row:

1. Extract buyer, title, deadline, budget, source, and requirements.
2. Derive an opportunity key with `software-contract-forge canon:key`.
3. Qualify with the score policy in `templates/score.json`.
4. Write a report and score JSON under `reports/`.
5. If the apply gate passes and no binding terms are required, prepare the application path.
6. Write a TSV row with `software-contract-forge contract-line`.

Return JSON with counts: `qualified`, `applied`, `proposal_drafted`, `skipped`, `blocked`, and `failed`.
