#!/bin/bash

# Debug script to trace exactly what's happening in real job execution
echo "🔍 Debugging Actual difFUBAR Job Execution"
echo "=========================================="

# Test with actual job data
JOB_ID="6887ffa20f3e7a5db59ecdf7"
OUTPUT_DIR="app/difFubar/output"
SCRIPT_PATH="app/difFubar/difFubar.sh"

echo "Job ID: $JOB_ID"
echo "Output directory: $OUTPUT_DIR"
echo "Script path: $SCRIPT_PATH"

# Check if job files exist
echo -e "\n📁 Checking job files:"
if [ -f "$OUTPUT_DIR/${JOB_ID}" ]; then
    echo "✅ Main job file exists"
    echo "   Size: $(wc -c < "$OUTPUT_DIR/${JOB_ID}") bytes"
else
    echo "❌ Main job file missing: $OUTPUT_DIR/${JOB_ID}"
fi

if [ -f "$OUTPUT_DIR/${JOB_ID}.tre" ]; then
    echo "✅ Tree file exists" 
    echo "   Size: $(wc -c < "$OUTPUT_DIR/${JOB_ID}.tre") bytes"
else
    echo "❌ Tree file missing: $OUTPUT_DIR/${JOB_ID}.tre"
fi

# Check script
echo -e "\n📜 Checking script:"
if [ -f "$SCRIPT_PATH" ]; then
    echo "✅ Script exists"
    echo "   Permissions: $(ls -la "$SCRIPT_PATH" | awk '{print $1}')"
    echo "   Modified: $(ls -la "$SCRIPT_PATH" | awk '{print $6, $7, $8}')"
else
    echo "❌ Script missing: $SCRIPT_PATH"
fi

# Test script execution with actual job parameters
echo -e "\n🧪 Testing script with actual job parameters:"

# Simulate the exact parameters that would be passed
TEST_FN="$OUTPUT_DIR/$JOB_ID"
TEST_TREE="$OUTPUT_DIR/${JOB_ID}.tre"  
TEST_SFN="$OUTPUT_DIR/${JOB_ID}.status"
TEST_PFN="$OUTPUT_DIR/${JOB_ID}.difFubar.progress"
TEST_RFN="$OUTPUT_DIR/${JOB_ID}.difFubar"
TEST_CWD="$(pwd)/app/difFubar"

echo "Parameters that would be passed:"
echo "  fn=$TEST_FN"
echo "  tree_fn=$TEST_TREE"
echo "  sfn=$TEST_SFN" 
echo "  pfn=$TEST_PFN"
echo "  rfn=$TEST_RFN"
echo "  cwd=$TEST_CWD"

# Create a safe test version of the script
cp "$SCRIPT_PATH" "/tmp/difFubar_debug.sh"

# Modify it to stop before Julia and show us what's happening
cat >> "/tmp/difFubar_debug.sh" << 'EOF'

# DEBUG: Show what we have before Julia execution
echo "=== DEBUG OUTPUT ===" >&2
echo "Working directory: $(pwd)" >&2
echo "Script arguments were: $@" >&2
echo "Environment variables:" >&2
echo "  fn=$fn" >&2
echo "  tree_fn=$tree_fn" >&2
echo "  sfn=$sfn" >&2
echo "  pfn=$pfn" >&2
echo "  rfn=$rfn" >&2
echo "Script would now call Julia with:" >&2
echo "  $JULIA_CMD --project=$JULIA_PROJECT_PATH -t auto $SCRIPT_DIR/difFubar_analysis.jl" >&2
echo "===================" >&2

# Write debug info to progress file
echo "DEBUG: Environment parsed successfully" > "$pfn"
exit 0  # Exit before Julia to see if parameter parsing worked
EOF

chmod +x "/tmp/difFubar_debug.sh"

echo -e "\n🏃 Running debug script:"
echo "Command: /tmp/difFubar_debug.sh fn=$TEST_FN tree_fn=$TEST_TREE sfn=$TEST_SFN pfn=$TEST_PFN rfn=$TEST_RFN cwd=$TEST_CWD"

# Run the debug script and capture output
DEBUG_OUTPUT=$(timeout 10 /tmp/difFubar_debug.sh \
    "fn=$TEST_FN" \
    "tree_fn=$TEST_TREE" \
    "sfn=$TEST_SFN" \
    "pfn=$TEST_PFN" \
    "rfn=$TEST_RFN" \
    "cwd=$TEST_CWD" \
    2>&1)

echo "Debug script output:"
echo "$DEBUG_OUTPUT"

echo -e "\n📄 Checking if progress file was updated:"
if [ -f "$TEST_PFN" ]; then
    echo "Progress file content: $(cat "$TEST_PFN")"
else
    echo "Progress file not created/updated"
fi

# Clean up
rm -f "/tmp/difFubar_debug.sh"

echo -e "\n✅ Debug complete"