#!/usr/bin/env bash
set -euo pipefail

# Run the CLI tool and capture the output
output=$(npm run bin redteam generate -- -c test/redteam/integration/dodoguardconfig.yaml)

echo "Done running dodoguard redteam generate"

# Check if error log exists and display contents if it does
if [ -f "dodoguard-errors.log" ]; then
  echo "ERROR: dodoguard-errors.log exists:"
  cat "dodoguard-errors.log"
  exit 1
else
  echo "Confirmed: No dodoguard-errors.log file exists"
fi

# Check for expected output patterns
if echo "$output" | grep -q "Wrote 2[34] test cases to redteam.yaml"; then
  echo "Expected line (Wrote 2[34] test cases to redteam.yaml) found for dodoguard redteam generate"
else
  echo "ERROR: Expected line (Wrote 2[34] test cases to redteam.yaml) not found in output."
  echo "$output"
  exit 1
fi

echo "Running dodoguard redteam eval"
export DODOGUARD_AUTHOR="ci-placeholder@dodoguard.dev"
output=$(npm run bin redteam eval) || {
  exit_code=$?
  if [ $exit_code -eq 100 ]; then
    echo "Got exit code 100 - this is acceptable"
  else
    echo "Command failed with exit code $exit_code"
    exit $exit_code
  fi
}
echo "Done running dodoguard redteam eval"

echo "Checking for errors in dodoguard-errors.log"
if [ -f "dodoguard-errors.log" ]; then
  echo "ERROR: dodoguard-errors.log exists:"
  cat "dodoguard-errors.log"
  exit 1
else
  echo "Confirmed: No dodoguard-errors.log file exists"
fi

if echo "$output" | grep -q "Errors: 0"; then
  echo "Expected line found (Errors: 0) for dodoguard redteam eval"
else
  echo "ERROR: Expected line (Errors: 0) not found in output."
  echo "$output"
  exit 1
fi

echo "All checks passed!"
exit 0
