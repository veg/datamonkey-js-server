#!/bin/bash

# Run difFUBAR backend tests

echo "=================================="
echo "Running difFUBAR Backend Tests"
echo "=================================="
echo ""

# Change to the test directory
cd "$(dirname "$0")"

# Check if mocha is installed
if ! command -v mocha &> /dev/null; then
    echo "Installing mocha locally..."
    npm install --save-dev mocha chai
fi

echo "Running unit tests..."
../node_modules/.bin/mocha difFubar.test.js --reporter spec

echo ""
echo "Running integration tests..."
../node_modules/.bin/mocha difFubar.integration.test.js --reporter spec --timeout 60000

echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="

# Count test files
UNIT_TESTS=$(grep -c "it(" difFubar.test.js)
INTEGRATION_TESTS=$(grep -c "it(" difFubar.integration.test.js)
TOTAL_TESTS=$((UNIT_TESTS + INTEGRATION_TESTS))

echo "Total test files: 2"
echo "Unit tests: $UNIT_TESTS"
echo "Integration tests: $INTEGRATION_TESTS"
echo "Total tests: $TOTAL_TESTS"
echo ""

# Run tests with coverage if nyc is available
if command -v nyc &> /dev/null; then
    echo "Running tests with coverage..."
    nyc --reporter=text mocha difFubar.test.js difFubar.integration.test.js
fi