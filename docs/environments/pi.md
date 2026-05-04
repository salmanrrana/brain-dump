# Pi Integration Guide

Brain Dump supports Pi as a CLI-only ticket execution environment. Pi launches receive the same ticket context and Ralph workflow prompts as other providers, but Brain Dump does not configure Pi MCP, Pi credentials, or global Pi settings.

## Quick Start

### Installation

```bash
./install.sh --pi
```

This installs Brain Dump-managed Pi workflow files into `~/.pi/` and keeps a project-local source copy in `.pi/`:

- `.pi/prompts/` contains prompt templates for starting, reviewing, completing, and demoing tickets.
- `.pi/skills/` contains Brain Dump workflow, ticket selection, and review guidance for Pi sessions.

## Using Brain Dump in Pi

1. Start Brain Dump:

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. Open a ticket and click **Start with Pi**, or launch Ralph from the CLI:

   ```bash
   brain-dump workflow launch-ticket --ticket <id> --provider pi --pretty
   brain-dump workflow launch-epic --epic <id> --provider pi --max-iterations 20 --pretty
   ```

3. Brain Dump writes the ticket context file, opens the selected terminal, and invokes the Pi CLI from the project directory.

4. For autonomous Ralph launches, Brain Dump uses the Ralph loop with a Pi backend and sets Pi/Ralph environment markers so comments and telemetry are attributed as Pi or Ralph (Pi).

## CLI-Only Behavior

Pi support intentionally does not install or modify MCP configuration. Brain Dump uses its own server-side workflow calls before launch, then passes context to Pi through local prompt and context files.

Because Pi is CLI-only in Brain Dump:

- `./install.sh --pi` does not add an MCP server entry to Pi.
- `./install.sh --pi` does not modify Pi credentials or user settings.
- `./uninstall.sh --pi` removes only Brain Dump-managed Pi prompts and skills.
- Existing user-created `.pi` content is left in place unless Brain Dump created it.

## Troubleshooting

### Pi launch fails

1. Verify the Pi CLI is installed:

   ```bash
   pi --version
   ```

2. Re-run setup to refresh Brain Dump prompts and skills:

   ```bash
   ./install.sh --pi
   ```

3. For Ralph launches, confirm your Pi CLI supports the required headless invocation. If it does not, use interactive **Start with Pi** until your local Pi CLI supports headless execution.
