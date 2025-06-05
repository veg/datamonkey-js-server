# Testing SLURM and Local Job Submission Support

This document describes how to test the job submission configurations implemented in the `add-slurm-support` branch.

## Overview

The branch adds support for:
1. **SLURM job submission** - Using `sbatch` instead of the original `qsub` (TORQUE)
2. **Local job execution** - Running jobs directly on the server without a job scheduler

## Configuration

Job submission type is configured in `config.json` using the `submit_type` parameter:

```json
{
  "submit_type": "qsub"  // Options: "qsub", "sbatch", or "local"
}
```

## Testing Scripts

Three testing scripts are provided:

### 1. Simple Job Submission Test

Tests basic job submission for a specific submission type:

```bash
node test_job_submission.js --type=<qsub|sbatch|local>
```

### 2. Job Configuration Test

Tests the configuration settings for job submission:

```bash
node test_job_configs.js --test-type=<qsub|sbatch|local|all>
```

### 3. Comprehensive Test

Runs a comprehensive test of all job submission methods:

```bash
node test_slurm_support.js --submit-type=<qsub|sbatch|local|all>
```

## Expected Results

The testing scripts will create a directory called `test_output` with results from each test run.

### For SLURM Testing

To test SLURM, you need access to a system with SLURM installed. The tests will verify:
- Job submission via `sbatch`
- Job status monitoring via `sacct`
- Correct event handling for job completion

### For Local Testing

Local job execution can be tested on any system. The tests will verify:
- Direct script execution
- Process monitoring
- Correct event handling for job completion

### For TORQUE Testing

To test TORQUE (original system), you need access to a system with TORQUE installed. The tests will verify:
- Job submission via `qsub`
- Job status monitoring via `qstat`
- Correct event handling for job completion

## Interpreting Test Results

Each test will output:
- Job submission status
- Events triggered during job execution
- Final job result
- Overall test status (pass/fail)

For a comprehensive test report, use `node test_slurm_support.js --submit-type=all`