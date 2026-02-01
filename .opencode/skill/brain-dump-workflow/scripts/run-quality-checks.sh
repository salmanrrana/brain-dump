#!/bin/bash
# Brain Dump Quality Gates
# Runs all quality checks required before completing ticket work.
# Exit code 0 = all passed, non-zero = failure.

set -e

echo "Running quality gates..."
echo ""

echo "1/3 Type checking..."
pnpm type-check
echo ""

echo "2/3 Linting..."
pnpm lint
echo ""

echo "3/3 Running tests..."
pnpm test
echo ""

echo "All quality gates passed."
