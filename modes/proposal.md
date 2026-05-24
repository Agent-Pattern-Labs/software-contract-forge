# Proposal Mode

Draft contract proposals, capability statements, answers, or buyer messages.

## Inputs

- Qualification report and source excerpts.
- `config/client-profile.yml`.
- Any reusable case studies or capability proof explicitly present in the consumer project.

## Procedure

1. Identify the exact requested submission format.
2. Separate factual claims from positioning.
3. Use `@general-paid` for narrative drafting.
4. Include the file-backed opportunity URL or contract link in the buyer-facing draft, preferably near the opening or reference line. If no URL exists, state which local source record the draft is based on.
5. Do not invent references, certifications, past clients, availability, staff count, insurance, or rates.
6. Mark any binding price, delivery commitment, or legal term with `USER REVIEW REQUIRED` unless the profile allows automatic submission.
7. Save drafts under `reports/`.

## Output

Return the draft path, missing facts, and whether the draft is safe to submit automatically.
