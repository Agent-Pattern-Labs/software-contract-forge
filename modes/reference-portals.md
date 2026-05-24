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

## Preflight

Before a batch of public ATS portal applications, prefer:

```sh
software-contract-forge portal:preflight --input batch/batch-input.tsv --format json
```

Use `ready` rows first. Treat `blocked` rows as user-review required. `needs_review` rows may need proposal prose or field-specific judgment before submit.

Required resume/CV upload is allowed when a local resume file exists in the consumer project, such as `data/raw/resume/*.pdf`. Do not block solely because a portal asks for a resume if the file is present and the submission is otherwise non-binding.

## OTP

If Gmail MCP is configured, search recent messages from the portal sender, read the matching message, extract the one-time code, and enter it. Do not paste email content into final summaries.

## Session Hygiene

For fresh portal tasks, clean up stale browser sessions before connecting. Use isolated sessions for each opportunity.
