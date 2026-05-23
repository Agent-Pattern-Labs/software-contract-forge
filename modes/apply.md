# Apply Mode

Submit interest, application forms, or proposal packages for qualified software contract opportunities.

## Preconditions

- Opportunity has passed the `apply` score gate.
- Dedupe check is complete.
- `config/client-profile.yml` allows the intended submission type.
- Binding terms are either absent or explicitly approved for auto-submission.

## Procedure

1. Read the qualification report and score JSON.
2. Confirm `software-contract-forge score:gate --gate apply --input <score.json>` passes.
3. Confirm no existing `applied`, `proposal_drafted`, `won`, or active `follow_up_due` state exists for the opportunity key.
4. If a portal must be driven, delegate to `@general-free`.
5. If proposal prose or custom answers are needed, delegate that writing to `@general-paid` first.
6. Submit only non-binding applications unless the client profile explicitly allows the binding commitment.
7. Write an outcome row with `software-contract-forge contract-line`.
8. Add or update the dated application log in `data/applications/`.

## Blockers

Stop and return `blocked` for login, captcha, unknown rate, payment request, legal terms, missing client proof, compliance attestations, or buyer-required documents not present locally.

## Output

Return one of: `applied`, `proposal_drafted`, `blocked`, `skipped`, or `lost`, with the artifact paths.
