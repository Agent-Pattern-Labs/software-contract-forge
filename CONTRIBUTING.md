# Contributing

Thanks for considering a contribution.

## Development

```sh
npm install
npm run validate
npm run build:config
npx agentmd lint iso/instructions.md
npx iso build . --dry-run
```

Keep source-of-truth agent changes in `iso/`, then regenerate runtime surfaces with `npm run build:config`.

## Pull Requests

- Keep private client data out of fixtures, examples, prompts, and generated files.
- Prefer deterministic helpers in `scripts/` for repeated state, scoring, identity, and validation logic.
- Update templates and modes together when changing workflow behavior.
- Include validation output in the PR description.
