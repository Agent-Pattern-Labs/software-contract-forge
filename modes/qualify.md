# Qualify Mode

Evaluate a contract opportunity against the client profile and score gates.

## Inputs

- Opportunity URL, pasted text, or row from `data/pipeline.md`
- `config/client-profile.yml`
- `templates/score.json`

## Procedure

1. Extract buyer, title, source URL, deadline, budget, expected scope, required skills, eligibility, location, submission steps, and risk flags.
2. Derive the opportunity key with `software-contract-forge canon:key`.
3. Check duplicate state before scoring.
4. Score dimensions from 0 to 5: `fit`, `budget`, `probability`, `risk`, `timeline`, `strategic`.
5. Write score JSON and a concise qualification report under `reports/`.
6. Run `software-contract-forge score:check --input <score.json>`.
7. If the `qualify` gate passes, mark the lead `qualified`; otherwise mark `skipped` with reason.

## Output Artifact

Qualification reports should include:

- Opportunity key
- Source URL
- Buyer and title
- Score and gate result
- Why pursue or skip
- Risks and missing facts
- Recommended next action
