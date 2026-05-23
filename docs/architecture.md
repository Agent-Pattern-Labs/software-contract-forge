# Architecture

Software Contract Forge follows the JobForge-style harness split:

- The package owns shared instructions, modes, templates, deterministic helper CLIs, scaffolding, and sync behavior.
- Consumer projects own private profile data, source configuration, raw leads, reports, and application state.

`iso/` is the source of truth for agent runtime configuration. Generated runtime files can be produced from `iso/` with the `@agent-pattern-labs/iso-harness` toolchain when dependencies are installed.

The active context is intentionally small: load `modes/_shared.md`, one workflow mode, and a reference file only when a blocker requires it.
