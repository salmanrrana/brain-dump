#!/bin/bash
# Brain Dump validation discovery helper.
# Runs project-specific validation commands when they can be discovered.
# Exit code 0 = discovered commands passed, or no automated command was found.
# Non-zero = a discovered validation command failed.

set -e

COMMANDS_FILE="$(mktemp)"
trap 'rm -f "$COMMANDS_FILE"' EXIT

have() {
  command -v "$1" >/dev/null 2>&1
}

add_command() {
  printf '%s\n' "$1" >>"$COMMANDS_FILE"
}

has_commands() {
  [ -s "$COMMANDS_FILE" ]
}

echo "Discovering project validation commands..."
echo ""

if [ -f package.json ] && have node; then
  node <<'NODE' >>"$COMMANDS_FILE"
const fs = require("node:fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = pkg.scripts ?? {};
const packageManager =
  typeof pkg.packageManager === "string"
    ? pkg.packageManager.split("@")[0]
    : fs.existsSync("pnpm-lock.yaml")
      ? "pnpm"
      : fs.existsSync("bun.lock") || fs.existsSync("bun.lockb")
        ? "bun"
        : fs.existsSync("yarn.lock")
          ? "yarn"
          : "npm";

function hasScript(name) {
  return Object.prototype.hasOwnProperty.call(scripts, name);
}

function command(name) {
  return `${packageManager} run ${name}`;
}

if (hasScript("check")) {
  console.log(command("check"));
} else {
  for (const name of ["type-check", "typecheck", "lint", "test"]) {
    if (hasScript(name)) {
      console.log(command(name));
    }
  }
}
NODE
elif [ -f package.json ]; then
  echo "package.json exists, but node is not available to inspect scripts."
fi

if [ -f go.mod ] && have go; then
  add_command "go test ./..."
fi

if [ -f Cargo.toml ] && have cargo; then
  add_command "cargo test"
fi

if find . -maxdepth 2 \( -name "*.sln" -o -name "*.csproj" \) -print -quit | grep -q . && have dotnet; then
  add_command "dotnet test"
fi

if [ -x ./gradlew ]; then
  add_command "./gradlew test"
elif [ -f pom.xml ] && have mvn; then
  add_command "mvn test"
fi

if [ -f pyproject.toml ] || [ -f setup.py ] || [ -f pytest.ini ] || [ -f tox.ini ]; then
  if have uv && { [ -f uv.lock ] || grep -Eq 'pytest|ruff' pyproject.toml setup.py pytest.ini tox.ini 2>/dev/null; }; then
    if grep -Eq 'pytest|\[tool.pytest' pyproject.toml setup.py pytest.ini tox.ini 2>/dev/null; then
      add_command "uv run pytest"
    fi
    if [ -f ruff.toml ] || [ -f .ruff.toml ] || grep -Eq '\[tool\.ruff' pyproject.toml 2>/dev/null; then
      add_command "uv run ruff check ."
    fi
  else
    if have pytest && grep -Eq 'pytest|\[tool.pytest' pyproject.toml setup.py pytest.ini tox.ini 2>/dev/null; then
      add_command "pytest"
    fi
    if have ruff && { [ -f ruff.toml ] || [ -f .ruff.toml ] || grep -Eq '\[tool\.ruff' pyproject.toml 2>/dev/null; }; then
      add_command "ruff check ."
    fi
  fi
fi

if ! has_commands && [ -f Makefile ]; then
  if grep -Eq '^check:' Makefile; then
    add_command "make check"
  elif grep -Eq '^test:' Makefile; then
    add_command "make test"
  fi
fi

if ! has_commands && [ -f justfile ] && have just; then
  if grep -Eq '^check:' justfile; then
    add_command "just check"
  elif grep -Eq '^test:' justfile; then
    add_command "just test"
  fi
fi

if ! has_commands; then
  echo "No automated validation command discovered."
  echo "Run a targeted manual smoke check for the changed behavior and record that no project validation command was found."
  exit 0
fi

echo "Discovered validation commands:"
sed 's/^/- /' "$COMMANDS_FILE"
echo ""

while IFS= read -r command_to_run; do
  [ -n "$command_to_run" ] || continue
  echo "Running: $command_to_run"
  sh -c "$command_to_run"
  echo ""
done <"$COMMANDS_FILE"

echo "All discovered validation commands passed."
