# difFUBAR Backend Tests

This directory contains comprehensive tests for the difFUBAR backend implementation to prevent regression issues.

## Test Files

### 1. `difFubar.test.js` - Unit Tests
Tests individual components of the difFUBAR backend:
- **difFubar.js module**: Instance creation, parameter handling, tree mode selection
- **difFubar.sh shell script**: Argument parsing, file creation, error handling
- **difFubar_analysis.jl**: Command line argument parsing, parameter validation
- **NEXUS parsing**: Both labeled and NOLABELS formats
- **Tagged tree support**: Tag detection and parsing
- **Logging**: Status file appending, stdout capture
- **Error handling**: Missing files, malformed inputs

### 2. `difFubar.integration.test.js` - Integration Tests
Tests the complete workflow:
- **Full workflow**: End-to-end execution with all components
- **Debugging command generation**: Verifies correct command formatting
- **Parameter validation**: Numeric parameter bounds checking
- **File format detection**: NEXUS vs FASTA identification
- **Tree tag extraction**: Multiple tag formats
- **Sequence validation**: Codon alignment requirements

## Running Tests

### Quick Run
```bash
./run-difFubar-tests.sh
```

### Individual Test Files
```bash
# Run unit tests only
mocha difFubar.test.js

# Run integration tests only
mocha difFubar.integration.test.js --timeout 60000

# Run with detailed output
mocha difFubar.test.js --reporter spec

# Run specific test suite
mocha difFubar.test.js --grep "NEXUS parsing"
```

### With Coverage
```bash
# Install coverage tool
npm install --save-dev nyc

# Run with coverage
nyc mocha difFubar.test.js difFubar.integration.test.js
```

## Test Data

The tests use minimal synthetic data to ensure fast execution:
- **Sample NEXUS files**: With and without labels
- **Sample FASTA files**: For format detection
- **Tagged trees**: With {FG1}, {FG2}, {Foreground}, {Test} tags
- **Codon sequences**: 12bp sequences (4 codons)

## Key Test Scenarios

1. **Tagged Tree Support**
   - Verifies that tagged trees are preferred over NJ trees
   - Tests fallback to NJ tree when no tagged tree provided

2. **NEXUS Parsing**
   - Tests both labeled format ('Human' ATGATG)
   - Tests NOLABELS format (just sequences in TAXLABELS order)
   - Verifies quote removal from taxon names

3. **Command Line Arguments**
   - Tests conversion from key=value to positional arguments
   - Verifies all parameters are passed correctly

4. **Logging and Debugging**
   - Tests [BASH] and [JULIA] prefix preservation
   - Verifies append mode for status files
   - Tests debugging command generation

5. **Error Handling**
   - Missing input files
   - Malformed trees
   - Invalid parameters
   - Sequence format issues

## Expected Behavior

### Successful Run
1. Bash script creates status and progress files
2. Julia script parses arguments and displays parameters
3. NEXUS file is parsed correctly with taxon names
4. Tagged tree is parsed and tags extracted
5. Status file contains both [BASH] and [JULIA] entries
6. Stdout log contains complete debugging command

### Error Cases
- Missing arguments: Shows usage message
- Invalid files: Reports specific error
- Malformed data: Provides helpful error messages

## Continuous Integration

These tests should be run:
- Before committing changes to difFUBAR backend
- In CI/CD pipeline
- After Julia package updates
- When debugging field issues

## Debugging Test Failures

If tests fail:

1. **Check Julia installation**
   ```bash
   julia --version
   cd app/difFubar && julia --project="./.julia_env" -e "using Pkg; Pkg.status()"
   ```

2. **Verify file permissions**
   ```bash
   ls -la app/difFubar/difFubar.sh
   ls -la app/difFubar/difFubar_analysis.jl
   ```

3. **Run individual components**
   ```bash
   # Test shell script
   bash app/difFubar/difFubar.sh

   # Test Julia script
   julia --project="./.julia_env" app/difFubar/difFubar_analysis.jl
   ```

4. **Check test output**
   - Look for specific error messages in test output
   - Check generated files in test directories
   - Review stdout/stderr from spawned processes

## Adding New Tests

When adding features to difFUBAR:

1. Add unit tests for new functions/modules
2. Add integration tests for new workflows
3. Update test data if new formats supported
4. Document expected behavior in this README

## Test Coverage Goals

- **Unit test coverage**: >80% of JavaScript code
- **Integration coverage**: All major workflows
- **Error scenarios**: All user-facing error conditions
- **Performance**: Tests should complete in <60 seconds