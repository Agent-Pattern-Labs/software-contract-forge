# Follow-Up Mode

Find submitted opportunities that need follow-up.

## Inputs

- `data/applications/`
- `reports/`
- Client follow-up preferences in `config/client-profile.yml`

## Procedure

1. Identify `applied`, `proposal_drafted`, and `follow_up_due` entries.
2. Apply the client profile's follow-up timing.
3. Draft short follow-up messages only from file-backed facts.
4. Include the original opportunity URL or contract link in the follow-up when present, so the buyer can identify the specific posting.
5. Do not claim urgency, relationships, or buyer commitments unless present in the record.

## Output

Return due items, recommended message paths, and any stale or missing records.
