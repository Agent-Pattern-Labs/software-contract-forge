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
7. If the portal blocks on captcha, login, OTP/security code, or other user-side challenge, use `software-contract-forge portal:handoff --url URL --out reports/<id>-handoff.json` only when the user is available to complete the action. Count the application only when the handoff report confirms `applied`.
8. Write an outcome row with `software-contract-forge contract-line`.
9. Add or update the dated application log in `data/applications/`.

## Blockers

Stop and return `blocked` for login, captcha, payment request, legal terms, missing client proof, compliance attestations, or buyer-required documents not present locally.

Unknown posted rate alone is not a blocker for a non-binding expression of interest when the form does not ask for compensation and the application does not commit to pricing. Stop when the portal asks for hourly rate, salary, fixed price, target compensation, budget acceptance, or other binding commercial terms unless the client profile explicitly allows the answer.

## Output

Return one of: `applied`, `proposal_drafted`, `blocked`, `skipped`, or `lost`, with the artifact paths.
