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
6. For buyer-facing direct emails, proposal packages, cover letters, or free-text form answers, include the file-backed opportunity URL or contract link so the buyer and client can identify the exact posting. If the application portal has no safe field for the link, record that limitation in the report or tracker notes.
7. Submit only non-binding applications unless the client profile explicitly allows the binding commitment.
8. If the portal blocks on hCaptcha/reCAPTCHA/Turnstile, login, OTP/security code, or another user-side challenge, return the exact `software-contract-forge portal:handoff --url URL --out reports/<id>-handoff.json` command when the user is available to complete the action. Count the application only when the handoff report confirms `applied`.
9. Write an outcome row with `software-contract-forge contract-line`; notes should preserve the source opportunity URL when the row's URL is an application URL rather than the original posting.
10. Add or update the dated application log in `data/applications/`.

## Blockers

Stop and return `blocked` for login, hCaptcha/reCAPTCHA/Turnstile, payment request, legal terms, missing client proof, compliance attestations, or buyer-required documents not present locally. For captcha-style blockers on an otherwise safe form, include a `portal:handoff` next action instead of treating Geometra as a solver.

Unknown posted rate alone is not a blocker for a non-binding expression of interest when the form does not ask for compensation and the application does not commit to pricing. Stop when the portal asks for hourly rate, salary, fixed price, target compensation, budget acceptance, or other binding commercial terms unless the client profile explicitly allows the answer.

## Output

Return one of: `applied`, `proposal_drafted`, `blocked`, `skipped`, or `lost`, with the artifact paths.
