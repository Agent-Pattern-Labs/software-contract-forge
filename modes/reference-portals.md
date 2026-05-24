# Portal Reference

Use browser automation only for approved sources and application portals.

## Stop Conditions

Stop and return `blocked` for:

- Login or OTP unavailable.
- Captcha.
- Payment, platform credit, or bid purchase request.
- Mandatory legal certification not present in the client profile.
- Binding price or delivery commitment not explicitly allowed.
- File upload requested but the required file is absent.
- Required compensation, start-date, weekly-capacity, work-authorization, citizenship, government, security, privacy-consent, in-office, relocation, travel, background-check, identity-verification, exclusivity, or legal-attestation fields are not explicitly file-backed in the client profile.

Do not bypass captcha, anti-bot, login, OTP, security-code, or portal access controls. If the user explicitly wants to continue and is available to complete the challenge, use the handoff workflow below.

## Preflight

Before a batch of public ATS portal applications, prefer:

```sh
software-contract-forge portal:preflight --input batch/batch-input.tsv --format json
```

Use `ready` rows first. Treat `blocked` rows as user-review required. `needs_review` rows may need proposal prose or field-specific judgment before submit.

JSON output includes:

- `userActions`: portal/security actions that must be completed by the user, such as captcha, security code, login, or missing local files.
- `reviewItems`: exact categories and evidence for answers that require user approval, such as compensation, work authorization, availability, or legal consent.

Required resume/CV upload is allowed when a local resume file exists in the consumer project, such as `data/raw/resume/*.pdf`. Do not block solely because a portal asks for a resume if the file is present and the submission is otherwise non-binding.

## Handoff

For user-side portal challenges, prefer:

```sh
software-contract-forge portal:handoff --url URL --out reports/portal-handoff.json
```

This opens a headed browser with a persistent local profile under `batch/.portal-handoff-browser`, lets the user complete captcha, email security-code, login, or review-only fields, then records the final portal state. Count the application only if the handoff result is `applied` and the report includes portal confirmation evidence.

## OTP

If Gmail MCP is configured, search recent messages from the portal sender, read the matching message, extract the one-time code, and enter it. Do not paste email content into final summaries.

## Session Hygiene

For fresh portal tasks, clean up stale browser sessions before connecting. Use isolated sessions for each opportunity.
