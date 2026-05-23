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

## OTP

If Gmail MCP is configured, search recent messages from the portal sender, read the matching message, extract the one-time code, and enter it. Do not paste email content into final summaries.

## Session Hygiene

For fresh portal tasks, clean up stale browser sessions before connecting. Use isolated sessions for each opportunity.
