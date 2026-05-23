---
name: software-contract-forge
description: Software contract command center -- scan, qualify, propose, apply, track, and follow up
user_invocable: true
args: mode
---

# software-contract-forge -- Router

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|---|---|
| empty / no args | `discovery` |
| URL, pasted RFP, pasted contract description | `qualify` |
| `scan` | `scan` |
| `qualify` | `qualify` |
| `apply` | `apply` |
| `proposal` | `proposal` |
| `pipeline` | `pipeline` |
| `batch` | `batch` |
| `tracker` | `tracker` |
| `followup` | `followup` |

If the input is not a known sub-command and contains opportunity text, buyer names, requirements, budget, period of performance, SOW, RFP, RFQ, or a URL, run `qualify`.

## Discovery

Show this menu:

```text
software-contract-forge -- Command Center

  /software-contract-forge scan       Find new software contract leads
  /software-contract-forge qualify    Evaluate a pasted URL, RFP, or lead
  /software-contract-forge apply      Submit interest/application for a qualified lead
  /software-contract-forge proposal   Draft a proposal or questionnaire response
  /software-contract-forge pipeline   Process pending leads in data/pipeline.md
  /software-contract-forge batch      Process batch/batch-input.tsv
  /software-contract-forge tracker    Show application and proposal state
  /software-contract-forge followup   Show due follow-ups
```

## Context Loading

- For `scan`, `qualify`, `apply`, `proposal`, `pipeline`, and `batch`, read `modes/_shared.md` plus `modes/{mode}.md`.
- For `tracker` and `followup`, read only `modes/{mode}.md` unless a policy question requires `_shared.md`.
- Read `modes/reference-local-helpers.md` when choosing a helper.
- Read `modes/reference-setup.md` only for onboarding blockers.
- Read `modes/reference-portals.md` only for source, OTP, login, or browser blockers.

## Delegation

- Delegate repeated browser/source scanning to `@general-free`.
- Delegate proposal text and qualification narrative to `@general-paid`.
- Delegate small structured extraction to `@glm-minimal`.
- Never launch more than 2 subagents in parallel when they share browser sessions or write project state.
